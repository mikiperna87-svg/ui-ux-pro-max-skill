import 'server-only'

import { toCents } from '@/lib/money'
import { importiInCentesimi } from '@/server/queries/incassi'
import { createClient } from '@/lib/supabase/server'
import type { Enums, Tables, Views } from '@/lib/database.types'
import {
  pageCountFor,
  rangeFor,
  type ListParams,
  type ListResult,
} from '@/lib/list-params'

export type BookingRow = Views<'booking_list'>
export type BookingServiceRow = Views<'booking_service_list'>
export type BookingPassengerRow = Views<'booking_passenger_list'>

const BOOKING_STATUSES: readonly Enums['booking_status'][] = [
  'opzione',
  'confermata',
  'partita',
  'rientrata',
  'annullata',
]

const PAYMENT_STATES: readonly Enums['payment_state'][] = [
  'non_pagata',
  'acconto_versato',
  'saldata',
  'in_ritardo',
]

function isBookingStatus(value: string | undefined): value is Enums['booking_status'] {
  return value !== undefined && (BOOKING_STATUSES as readonly string[]).includes(value)
}

function isPaymentState(value: string | undefined): value is Enums['payment_state'] {
  return value !== undefined && (PAYMENT_STATES as readonly string[]).includes(value)
}

/**
 * Finestre temporali del filtro "periodo", calcolate sulla data di partenza.
 * Restano qui e non nell'indirizzo perché "questo mese" deve significare il
 * mese in cui si guarda l'elenco, non quello in cui il collegamento è nato.
 */
function departureWindow(periodo: string | undefined): { from?: string; to?: string } {
  const oggi = new Date()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  const inizioMese = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1))
  const fineMese = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() + 1, 0))

  switch (periodo) {
    case 'in_partenza':
      return { from: iso(oggi), to: iso(new Date(oggi.getTime() + 30 * 86_400_000)) }
    case 'mese':
      return { from: iso(inizioMese), to: iso(fineMese) }
    case 'passate':
      return { to: iso(new Date(oggi.getTime() - 86_400_000)) }
    case 'future':
      return { from: iso(oggi) }
    default:
      return {}
  }
}

/**
 * Elenco delle pratiche.
 *
 * Interroga la vista `booking_list`, che porta già cliente, operatore e quadro
 * economico: ordinare per margine o per saldo costa quanto ordinare per codice.
 */
export async function listBookings(params: ListParams): Promise<ListResult<BookingRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('booking_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    // Una pratica si cerca per codice, destinazione… e per cognome del cliente,
    // che è la cosa che un operatore ricorda per prima.
    // Dentro `or()` il filtro viaggia come stringa: lì il carattere jolly di
    // PostgREST è l'asterisco, e virgole o parentesi spezzerebbero la sintassi.
    const termine = params.search.replace(/[%*,().]/g, ' ').trim()
    query = query.or(`search_text.ilike.*${termine}*,customer_search.ilike.*${termine}*`)
  }
  if (isBookingStatus(params.filters.stato)) {
    query = query.eq('status', params.filters.stato)
  }
  if (params.filters.stato === 'aperte') {
    query = query.in('status', ['opzione', 'confermata', 'partita'])
  }
  if (isPaymentState(params.filters.pagamento)) {
    query = query.eq('payment_state', params.filters.pagamento)
  }
  if (params.filters.tipo === 'intermediazione' || params.filters.tipo === 'organizzazione') {
    query = query.eq('sale_type', params.filters.tipo)
  }
  if (params.filters.operatore) {
    query = query.eq('owner_id', params.filters.operatore)
  }
  if (params.filters.cliente) {
    query = query.eq('customer_id', params.filters.cliente)
  }

  const finestra = departureWindow(params.filters.periodo)
  if (finestra.from) query = query.gte('departure_date', finestra.from)
  if (finestra.to) query = query.lte('departure_date', finestra.to)

  const { data, error, count } = await query
    .order(params.sort ?? 'departure_date', {
      ascending: params.direction === 'asc',
      nullsFirst: false,
    })
    .range(from, to)

  if (error) throw new Error(`Elenco pratiche non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: data ?? [],
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

/** Tutte le righe che corrispondono ai filtri, per l'esportazione. */
export async function allBookingsForExport(params: ListParams): Promise<readonly BookingRow[]> {
  const result = await listBookings({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

export interface BookingDetail {
  readonly booking: Tables<'bookings'>
  readonly summary: BookingRow | null
  readonly customer: Pick<
    Tables<'customers'>,
    'id' | 'display_name' | 'email' | 'phone' | 'mobile' | 'city' | 'vat_number' | 'tax_code'
  > | null
  readonly services: readonly BookingServiceRow[]
  readonly passengers: readonly BookingPassengerRow[]
  readonly installments: readonly Views<'installment_list'>[]
  readonly paymentsIn: readonly Views<'payment_in_list'>[]
  readonly paymentsOut: readonly Views<'payout_list'>[]
  readonly documents: readonly Tables<'documents'>[]
  readonly tasks: readonly Views<'task_list'>[]
  readonly invoices: readonly Tables<'invoices'>[]
  readonly activity: readonly Tables<'activity_log'>[]
}

/**
 * Scheda della pratica: una sola andata e ritorno per ogni scheda visibile.
 * Le richieste partono insieme perché nessuna dipende dal risultato dell'altra.
 */
export async function getBookingDetail(id: string): Promise<BookingDetail | null> {
  const supabase = await createClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!booking) return null

  const [
    { data: summary },
    { data: customer },
    { data: services },
    { data: passengers },
    { data: installments },
    { data: paymentsIn },
    { data: paymentsOut },
    { data: documents },
    { data: tasks },
    { data: invoices },
    { data: activity },
  ] = await Promise.all([
    supabase.from('booking_list').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('customers')
      .select('id, display_name, email, phone, mobile, city, vat_number, tax_code')
      .eq('id', booking.customer_id)
      .maybeSingle(),
    supabase.from('booking_service_list').select('*').eq('booking_id', id).order('sort_order'),
    supabase.from('booking_passenger_list').select('*').eq('booking_id', id).order('full_name'),
    // Le tre viste del modulo incassi portano gia' lo stato calcolato: la
    // scheda della pratica e lo scadenzario leggono le stesse colonne, quindi
    // non possono raccontare due storie diverse sulla stessa rata.
    supabase.from('installment_list').select('*').eq('booking_id', id).order('due_date'),
    supabase
      .from('payment_in_list')
      .select('*')
      .eq('booking_id', id)
      .order('paid_at', { ascending: false }),
    supabase.from('payout_list').select('*').eq('booking_id', id).order('due_date'),
    supabase
      .from('documents')
      .select('*')
      .eq('booking_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('task_list')
      .select('*')
      .eq('booking_id', id)
      .order('due_at', { nullsFirst: false }),
    supabase
      .from('invoices')
      .select('*')
      .eq('booking_id', id)
      .is('deleted_at', null)
      .order('issue_date', { ascending: false }),
    supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', 'bookings')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return {
    booking,
    summary: summary ?? null,
    customer: customer ?? null,
    services: services ?? [],
    passengers: passengers ?? [],
    installments: (installments ?? []).map((riga) =>
      importiInCentesimi(riga, ['amount_cents', 'covered_cents', 'residual_cents']),
    ),
    paymentsIn: (paymentsIn ?? []).map((riga) => importiInCentesimi(riga, ['amount_cents'])),
    paymentsOut: (paymentsOut ?? []).map((riga) => importiInCentesimi(riga, ['amount_cents'])),
    documents: documents ?? [],
    tasks: tasks ?? [],
    invoices: (invoices ?? []).map((riga) =>
      importiInCentesimi(riga, ['taxable_cents', 'vat_cents', 'total_cents']),
    ),
    activity: activity ?? [],
  }
}

/** Importi della pratica già convertiti in centesimi interi. */
export function bookingAmounts(summary: BookingRow | null) {
  return {
    revenue: toCents(summary?.revenue_cents, 'ricavi della pratica'),
    cost: toCents(summary?.cost_cents, 'costi della pratica'),
    commission: toCents(summary?.commission_cents, 'commissioni della pratica'),
    margin: toCents(summary?.margin_cents, 'margine della pratica'),
    paid: toCents(summary?.paid_cents, 'incassato della pratica'),
    balance: toCents(summary?.balance_cents, 'saldo della pratica'),
    supplierDue: toCents(summary?.supplier_due_cents, 'da pagare ai fornitori'),
    marginBps: summary?.margin_bps ?? 0,
    paymentState: summary?.payment_state ?? ('non_pagata' as Enums['payment_state']),
  }
}

/** Operatori dell'agenzia, per il filtro e per l'assegnazione della pratica. */
export async function operatorOptions(): Promise<ReadonlyArray<{ id: string; label: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('memberships')
    .select('id, full_name, role')
    .is('deleted_at', null)
    .order('full_name')

  return (data ?? []).map((row) => ({ id: row.id, label: row.full_name ?? '(senza nome)' }))
}

/** Fornitori attivi, per le righe di servizio. */
export async function supplierOptions(): Promise<
  ReadonlyArray<{ id: string; label: string; commissionBps: number; vatRegime: Enums['vat_regime']; paymentTermsDays: number }>
> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id, name, default_commission_bps, default_vat_regime, payment_terms_days')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.name,
    commissionBps: row.default_commission_bps ?? 0,
    vatRegime: row.default_vat_regime,
    paymentTermsDays: row.payment_terms_days ?? 30,
  }))
}

/** Passeggeri in anagrafica, per collegarli a una pratica. */
export async function passengerOptions(): Promise<ReadonlyArray<{ id: string; label: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('passengers')
    .select('id, full_name')
    .is('deleted_at', null)
    .order('full_name')
    .limit(500)

  return (data ?? []).map((row) => ({ id: row.id, label: row.full_name ?? '(senza nome)' }))
}
