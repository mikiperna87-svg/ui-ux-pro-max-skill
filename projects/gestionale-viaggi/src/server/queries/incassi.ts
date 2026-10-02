import 'server-only'

import { toCents } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { Enums, Views } from '@/lib/database.types'
import {
  pageCountFor,
  rangeFor,
  type ListParams,
  type ListResult,
} from '@/lib/list-params'

export type InstallmentRow = Views<'installment_list'>
export type PayoutRow = Views<'payout_list'>
export type PaymentInRow = Views<'payment_in_list'>

/**
 * Normalizza gli importi che arrivano dal database.
 *
 * Un bigint oltre i 2^53 viaggia come stringa JSON, e una colonna numeric come
 * stringa sempre: sommare due stringhe le concatena, e il totale dello
 * scadenzario diventa un numero di quaranta cifre. La conversione si fa una
 * volta sola, qui al confine, e da lì in poi nel sistema esistono solo interi.
 */
export function importiInCentesimi<T extends Record<string, unknown>>(
  riga: T,
  campi: readonly (keyof T)[],
): T {
  const copia = { ...riga }
  for (const campo of campi) {
    copia[campo] = toCents(riga[campo], String(campo)) as T[keyof T]
  }
  return copia
}

const IMPORTI_RATA = ['amount_cents', 'covered_cents', 'residual_cents'] as const
const IMPORTI_PAGAMENTO = ['amount_cents'] as const

const STATI_RATA = ['saldata', 'parziale', 'scaduta', 'attesa'] as const
const STATI_PAGAMENTO: readonly Enums['payout_status'][] = [
  'da_pagare',
  'programmato',
  'pagato',
  'stornato',
]

function isStatoRata(value: string | undefined): value is (typeof STATI_RATA)[number] {
  return value !== undefined && (STATI_RATA as readonly string[]).includes(value)
}

function isStatoPagamento(value: string | undefined): value is Enums['payout_status'] {
  return value !== undefined && (STATI_PAGAMENTO as readonly string[]).includes(value)
}

/**
 * Finestre del filtro "quando", calcolate sulla data di scadenza.
 *
 * Il ritardo non è una finestra ma una condizione (residuo ancora aperto e data
 * passata): vive nella colonna `is_late` della vista, così il filtro resta una
 * query e non un conteggio fatto in pagina.
 */
function dueWindow(quando: string | undefined): { from?: string; to?: string; late?: boolean } {
  const oggi = new Date()
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  const fraGiorni = (giorni: number) => iso(new Date(oggi.getTime() + giorni * 86_400_000))

  switch (quando) {
    case 'in_ritardo':
      return { late: true }
    case 'settimana':
      return { from: iso(oggi), to: fraGiorni(7) }
    case 'mese':
      return { from: iso(oggi), to: fraGiorni(30) }
    case 'passate':
      return { to: iso(new Date(oggi.getTime() - 86_400_000)) }
    default:
      return {}
  }
}

/** Ripulisce il testo cercato: dentro `or()` di PostgREST il jolly è `*`. */
function termineDiRicerca(search: string): string {
  return search.replace(/[%*,().]/g, ' ').trim()
}

// --- Scadenze verso il cliente ------------------------------------------------
export async function listInstallments(params: ListParams): Promise<ListResult<InstallmentRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('installment_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    const termine = termineDiRicerca(params.search)
    query = query.or(`booking_search.ilike.*${termine}*,customer_search.ilike.*${termine}*`)
  }
  if (isStatoRata(params.filters.stato)) {
    query = query.eq('state', params.filters.stato)
  }
  if (params.filters.stato === 'aperte') {
    query = query.neq('state', 'saldata')
  }
  if (params.filters.operatore) {
    query = query.eq('owner_id', params.filters.operatore)
  }
  if (params.filters.cliente) {
    query = query.eq('customer_id', params.filters.cliente)
  }
  if (params.filters.pratica) {
    query = query.eq('booking_id', params.filters.pratica)
  }

  const finestra = dueWindow(params.filters.quando)
  if (finestra.late) query = query.eq('is_late', true)
  if (finestra.from) query = query.gte('due_date', finestra.from)
  if (finestra.to) query = query.lte('due_date', finestra.to)

  const { data, error, count } = await query
    .order(params.sort ?? 'due_date', { ascending: params.direction === 'asc', nullsFirst: false })
    .range(from, to)

  if (error) throw new Error(`Scadenzario non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_RATA)),
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

// --- Pagamenti ai fornitori ---------------------------------------------------
export async function listPayouts(params: ListParams): Promise<ListResult<PayoutRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('payout_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    const termine = termineDiRicerca(params.search)
    query = query.or(`booking_search.ilike.*${termine}*,supplier_search.ilike.*${termine}*`)
  }
  if (isStatoPagamento(params.filters.stato)) {
    query = query.eq('status', params.filters.stato)
  }
  if (params.filters.stato === 'aperti') {
    query = query.in('status', ['da_pagare', 'programmato'])
  }
  if (params.filters.fornitore) {
    query = query.eq('supplier_id', params.filters.fornitore)
  }
  if (params.filters.pratica) {
    query = query.eq('booking_id', params.filters.pratica)
  }

  const finestra = dueWindow(params.filters.quando)
  if (finestra.late) query = query.eq('is_late', true)
  if (finestra.from) query = query.gte('due_date', finestra.from)
  if (finestra.to) query = query.lte('due_date', finestra.to)

  const { data, error, count } = await query
    .order(params.sort ?? 'due_date', { ascending: params.direction === 'asc', nullsFirst: false })
    .range(from, to)

  if (error) throw new Error(`Pagamenti ai fornitori non disponibili: ${error.message}`)

  const total = count ?? 0
  return {
    rows: (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_PAGAMENTO)),
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

export interface TotaliScadenzario {
  readonly daIncassareCents: number
  readonly inRitardoCents: number
  readonly inRitardoCount: number
  readonly daPagareCents: number
  readonly pagamentiInRitardoCents: number
  readonly pagamentiInRitardoCount: number
}

/**
 * Totali in cima allo scadenzario.
 *
 * Sono deliberatamente calcolati sull'intero scadenzario e non sulla pagina
 * visibile: chi guarda questi numeri vuole sapere quanto deve rientrare in
 * cassa, non quanto ne mostrano le prime cinquanta righe.
 */
export async function totaliScadenzario(): Promise<TotaliScadenzario> {
  const supabase = await createClient()

  const [rate, pagamenti] = await Promise.all([
    supabase.from('installment_list').select('residual_cents, is_late').neq('state', 'saldata'),
    supabase
      .from('payout_list')
      .select('amount_cents, is_late')
      .in('status', ['da_pagare', 'programmato']),
  ])

  if (rate.error) throw new Error(`Totali dello scadenzario non disponibili: ${rate.error.message}`)
  if (pagamenti.error) {
    throw new Error(`Totali dei pagamenti non disponibili: ${pagamenti.error.message}`)
  }

  let daIncassareCents = 0
  let inRitardoCents = 0
  let inRitardoCount = 0
  for (const riga of rate.data ?? []) {
    const residuo = toCents(riga.residual_cents, 'residuo della scadenza')
    daIncassareCents += residuo
    if (riga.is_late) {
      inRitardoCents += residuo
      inRitardoCount += 1
    }
  }

  let daPagareCents = 0
  let pagamentiInRitardoCents = 0
  let pagamentiInRitardoCount = 0
  for (const riga of pagamenti.data ?? []) {
    const importo = toCents(riga.amount_cents, 'importo del pagamento')
    daPagareCents += importo
    if (riga.is_late) {
      pagamentiInRitardoCents += importo
      pagamentiInRitardoCount += 1
    }
  }

  return {
    daIncassareCents,
    inRitardoCents,
    inRitardoCount,
    daPagareCents,
    pagamentiInRitardoCents,
    pagamentiInRitardoCount,
  }
}

// --- Dati di supporto ---------------------------------------------------------
export async function supplierFilterOptions(): Promise<ReadonlyArray<{ id: string; label: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')
    .limit(300)

  if (error) return []
  return (data ?? []).map((riga) => ({ id: riga.id, label: riga.name }))
}

/** Scadenze ancora aperte di una pratica, per la tendina del modulo incasso. */
export async function openInstallmentsFor(
  bookingId: string,
): Promise<readonly InstallmentRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('installment_list')
    .select('*')
    .eq('booking_id', bookingId)
    .order('due_date')

  if (error) throw new Error(`Scadenze della pratica non disponibili: ${error.message}`)
  return (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_RATA))
}
