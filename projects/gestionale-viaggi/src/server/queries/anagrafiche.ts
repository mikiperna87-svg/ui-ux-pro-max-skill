import 'server-only'

import { toCents } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { Enums, Tables, Views } from '@/lib/database.types'
import {
  pageCountFor,
  rangeFor,
  type ListParams,
  type ListResult,
} from '@/lib/list-params'

/**
 * I filtri arrivano dall'indirizzo, quindi sono stringhe qualunque: vanno
 * ricondotti ai valori ammessi dal database prima di entrare in una query.
 */
const DOCUMENT_TYPES: readonly Enums['id_document_type'][] = [
  'carta_identita',
  'passaporto',
  'patente',
  'permesso_soggiorno',
]

const SUPPLIER_KINDS: readonly Enums['supplier_kind'][] = [
  'tour_operator',
  'compagnia_aerea',
  'compagnia_ferroviaria',
  'compagnia_marittima',
  'hotel',
  'dmc',
  'assicurazione',
  'noleggio',
  'altro',
]

function isDocumentType(value: string | undefined): value is Enums['id_document_type'] {
  return value !== undefined && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

function isSupplierKind(value: string | undefined): value is Enums['supplier_kind'] {
  return value !== undefined && (SUPPLIER_KINDS as readonly string[]).includes(value)
}

export type CustomerRow = Views<'customer_list'>
export type PassengerRow = Views<'passenger_list'>
export type SupplierRow = Views<'supplier_list'>

/**
 * Elenchi delle anagrafiche.
 *
 * Ogni elenco interroga la propria vista: ricerca, filtri, ordinamento e
 * conteggio totale in una sola richiesta, con solo la pagina richiesta che
 * attraversa la rete.
 */
export async function listCustomers(params: ListParams): Promise<ListResult<CustomerRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('customer_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    query = query.ilike('search_text', `%${params.search}%`)
  }
  if (params.filters.tipo === 'privato' || params.filters.tipo === 'azienda') {
    query = query.eq('kind', params.filters.tipo)
  }
  if (params.filters.tag) {
    query = query.contains('tags', [params.filters.tag])
  }
  if (params.filters.consenso === 'si') query = query.eq('marketing_consent', true)
  if (params.filters.consenso === 'no') query = query.eq('marketing_consent', false)
  if (params.filters.attivita === 'con_pratiche') query = query.gt('bookings_count', 0)
  if (params.filters.attivita === 'senza_pratiche') query = query.eq('bookings_count', 0)

  const { data, error, count } = await query
    .order(params.sort ?? 'display_name', { ascending: params.direction === 'asc' })
    .range(from, to)

  if (error) throw new Error(`Elenco clienti non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: data ?? [],
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

export async function listPassengers(params: ListParams): Promise<ListResult<PassengerRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('passenger_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    query = query.ilike('search_text', `%${params.search}%`)
  }
  if (params.filters.documento) {
    query = query.eq('document_state', params.filters.documento)
  }
  if (isDocumentType(params.filters.tipo_documento)) {
    query = query.eq('document_type', params.filters.tipo_documento)
  }
  if (params.filters.cliente) {
    query = query.eq('customer_id', params.filters.cliente)
  }

  const { data, error, count } = await query
    .order(params.sort ?? 'full_name', { ascending: params.direction === 'asc' })
    .range(from, to)

  if (error) throw new Error(`Elenco passeggeri non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: data ?? [],
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

export async function listSuppliers(params: ListParams): Promise<ListResult<SupplierRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('supplier_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    query = query.ilike('search_text', `%${params.search}%`)
  }
  if (isSupplierKind(params.filters.tipo)) {
    query = query.eq('kind', params.filters.tipo)
  }
  if (params.filters.attivo === 'si') query = query.eq('is_active', true)
  if (params.filters.attivo === 'no') query = query.eq('is_active', false)
  if (params.filters.scaduti === 'si') query = query.gt('overdue_payable_cents', 0)

  const { data, error, count } = await query
    .order(params.sort ?? 'name', { ascending: params.direction === 'asc' })
    .range(from, to)

  if (error) throw new Error(`Elenco fornitori non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: data ?? [],
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

/** Tutte le righe che soddisfano i filtri, per l'esportazione CSV. */
export async function allCustomersForExport(params: ListParams): Promise<readonly CustomerRow[]> {
  const result = await listCustomers({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

export async function allPassengersForExport(params: ListParams): Promise<readonly PassengerRow[]> {
  const result = await listPassengers({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

export async function allSuppliersForExport(params: ListParams): Promise<readonly SupplierRow[]> {
  const result = await listSuppliers({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

// --- Schede di dettaglio ------------------------------------------------------

export interface CustomerDetail {
  readonly customer: Tables<'customers'>
  readonly stats: Views<'customer_stats'> | null
  readonly passengers: readonly Tables<'passengers'>[]
  readonly bookings: readonly BookingSummary[]
  readonly invoices: readonly Tables<'invoices'>[]
  readonly activity: readonly Tables<'activity_log'>[]
}

export interface BookingSummary {
  readonly id: string
  readonly code: string
  readonly title: string
  readonly destination: string
  readonly departure_date: string | null
  readonly return_date: string | null
  readonly status: Tables<'bookings'>['status']
  readonly pax_count: number
  readonly revenue_cents: number
  readonly margin_cents: number
  readonly balance_cents: number
  readonly payment_state: NonNullable<Views<'booking_financials'>['payment_state']>
}

/** Unisce le pratiche al loro quadro economico senza interrogare riga per riga. */
async function bookingSummariesFor(
  column: 'customer_id',
  value: string,
  limit = 50,
): Promise<readonly BookingSummary[]> {
  const supabase = await createClient()

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, code, title, destination, departure_date, return_date, status, pax_count')
    .eq(column, value)
    .is('deleted_at', null)
    .order('departure_date', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) throw new Error(`Pratiche non disponibili: ${error.message}`)
  if (!bookings || bookings.length === 0) return []

  const { data: financials } = await supabase
    .from('booking_financials')
    .select('booking_id, revenue_cents, margin_cents, balance_cents, payment_state')
    .in(
      'booking_id',
      bookings.map((booking) => booking.id),
    )

  const byId = new Map((financials ?? []).map((row) => [row.booking_id, row]))

  return bookings.map((booking) => {
    const financial = byId.get(booking.id)
    return {
      ...booking,
      revenue_cents: toCents(financial?.revenue_cents, 'ricavi della pratica'),
      margin_cents: toCents(financial?.margin_cents, 'margine della pratica'),
      balance_cents: toCents(financial?.balance_cents, 'saldo della pratica'),
      payment_state: financial?.payment_state ?? 'non_pagata',
    }
  })
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) return null

  const [{ data: stats }, { data: passengers }, bookings, { data: invoices }, { data: activity }] =
    await Promise.all([
      supabase.from('customer_stats').select('*').eq('customer_id', id).maybeSingle(),
      supabase
        .from('passengers')
        .select('*')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('last_name'),
      bookingSummariesFor('customer_id', id),
      supabase
        .from('invoices')
        .select('*')
        .eq('customer_id', id)
        .is('deleted_at', null)
        .order('issue_date', { ascending: false })
        .limit(20),
      supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'customers')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

  return {
    customer,
    stats: stats ?? null,
    passengers: passengers ?? [],
    bookings,
    invoices: invoices ?? [],
    activity: activity ?? [],
  }
}

export interface PassengerDetail {
  readonly passenger: Tables<'passengers'>
  readonly documentState: Views<'passenger_documents'> | null
  readonly customer: Pick<Tables<'customers'>, 'id' | 'display_name'> | null
  readonly bookings: readonly BookingSummary[]
}

export async function getPassengerDetail(id: string): Promise<PassengerDetail | null> {
  const supabase = await createClient()

  const { data: passenger } = await supabase
    .from('passengers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!passenger) return null

  const [{ data: documentState }, { data: links }] = await Promise.all([
    supabase.from('passenger_documents').select('*').eq('passenger_id', id).maybeSingle(),
    supabase
      .from('booking_passengers')
      .select('booking_id')
      .eq('passenger_id', id)
      .is('deleted_at', null),
  ])

  let customer: PassengerDetail['customer'] = null
  if (passenger.customer_id) {
    const { data } = await supabase
      .from('customers')
      .select('id, display_name')
      .eq('id', passenger.customer_id)
      .maybeSingle()
    customer = data ?? null
  }

  let bookings: readonly BookingSummary[] = []
  const bookingIds = (links ?? []).map((link) => link.booking_id)
  if (bookingIds.length > 0) {
    const { data: rows } = await supabase
      .from('bookings')
      .select('id, code, title, destination, departure_date, return_date, status, pax_count')
      .in('id', bookingIds)
      .is('deleted_at', null)
      .order('departure_date', { ascending: false, nullsFirst: false })

    const { data: financials } = await supabase
      .from('booking_financials')
      .select('booking_id, revenue_cents, margin_cents, balance_cents, payment_state')
      .in('booking_id', bookingIds)

    const byId = new Map((financials ?? []).map((row) => [row.booking_id, row]))
    bookings = (rows ?? []).map((booking) => {
      const financial = byId.get(booking.id)
      return {
        ...booking,
        revenue_cents: toCents(financial?.revenue_cents, 'ricavi della pratica'),
        margin_cents: toCents(financial?.margin_cents, 'margine della pratica'),
        balance_cents: toCents(financial?.balance_cents, 'saldo della pratica'),
        payment_state: financial?.payment_state ?? 'non_pagata',
      }
    })
  }

  return { passenger, documentState: documentState ?? null, customer, bookings }
}

export interface SupplierDetail {
  readonly supplier: Tables<'suppliers'>
  readonly stats: Views<'supplier_stats'> | null
  readonly payments: readonly Tables<'payments_out'>[]
  readonly services: readonly ServiceSummary[]
}

export interface ServiceSummary {
  readonly id: string
  readonly description: string
  readonly service_type: Tables<'booking_services'>['service_type']
  readonly date_from: string | null
  readonly total_cost_cents: number
  readonly total_price_cents: number
  readonly commission_cents: number
  readonly booking_code: string | null
  readonly booking_id: string | null
}

export async function getSupplierDetail(id: string): Promise<SupplierDetail | null> {
  const supabase = await createClient()

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!supplier) return null

  const [{ data: stats }, { data: payments }, { data: services }] = await Promise.all([
    supabase.from('supplier_stats').select('*').eq('supplier_id', id).maybeSingle(),
    supabase
      .from('payments_out')
      .select('*')
      .eq('supplier_id', id)
      .is('deleted_at', null)
      .order('due_date', { ascending: false })
      .limit(30),
    supabase
      .from('booking_services')
      .select(
        'id, description, service_type, date_from, total_cost_cents, total_price_cents, commission_cents, booking_id',
      )
      .eq('supplier_id', id)
      .is('deleted_at', null)
      .order('date_from', { ascending: false, nullsFirst: false })
      .limit(30),
  ])

  let byBooking = new Map<string, string>()
  const bookingIds = [...new Set((services ?? []).map((service) => service.booking_id))]
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, code')
      .in('id', bookingIds)
    byBooking = new Map((bookings ?? []).map((booking) => [booking.id, booking.code]))
  }

  return {
    supplier,
    stats: stats ?? null,
    payments: payments ?? [],
    services: (services ?? []).map((service) => ({
      id: service.id,
      description: service.description,
      service_type: service.service_type,
      date_from: service.date_from,
      total_cost_cents: toCents(service.total_cost_cents, 'costo del servizio'),
      total_price_cents: toCents(service.total_price_cents, 'prezzo del servizio'),
      commission_cents: toCents(service.commission_cents, 'commissione'),
      booking_code: byBooking.get(service.booking_id) ?? null,
      booking_id: service.booking_id,
    })),
  }
}

/** Clienti per le tendine di selezione (passeggero → cliente). */
export async function customerOptions(search = ''): Promise<ReadonlyArray<{ id: string; label: string }>> {
  const supabase = await createClient()
  let query = supabase
    .from('customers')
    .select('id, display_name')
    .is('deleted_at', null)
    .order('display_name')
    .limit(50)

  if (search !== '') query = query.ilike('search_text', `%${search}%`)

  const { data } = await query
  return (data ?? []).map((row) => ({ id: row.id, label: row.display_name ?? '(senza nome)' }))
}

/** Tag già usati nell'agenzia, per il filtro dell'elenco clienti. */
export async function customerTags(): Promise<readonly string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('customers').select('tags').is('deleted_at', null)
  const unique = new Set<string>()
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) unique.add(tag)
  }
  return [...unique].sort((a, b) => a.localeCompare(b, 'it'))
}
