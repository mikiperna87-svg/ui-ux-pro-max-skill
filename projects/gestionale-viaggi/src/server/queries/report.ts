import 'server-only'

import { toCents } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { Enums } from '@/lib/database.types'
import type { MonthlyPoint } from '@/server/queries/dashboard'

/**
 * Letture dei report direzionali.
 *
 * Ogni funzione chiama una sola volta il database, che restituisce righe già
 * aggregate: la RLS decide che cosa entra nell'aggregato, quindi un operatore
 * ottiene il report delle sue pratiche senza che qui ci sia un filtro in più
 * da ricordarsi. I conteggi arrivano come bigint — cioè come stringhe, quando
 * superano i 2^53 — e si normalizzano al confine, una volta sola.
 */

export interface OwnerRow {
  readonly ownerId: string | null
  readonly ownerName: string
  readonly bookingsCount: number
  readonly paxCount: number
  readonly revenueCents: number
  readonly costCents: number
  readonly commissionCents: number
  readonly marginCents: number
  readonly marginBps: number
  readonly averageTicketCents: number
  readonly collectedCents: number
  readonly balanceCents: number
  readonly cancelledCount: number
}

export interface QuoteOwnerRow {
  readonly ownerId: string | null
  readonly ownerName: string
  readonly quotesCount: number
  readonly sentCount: number
  readonly acceptedCount: number
  readonly convertedCount: number
  readonly rejectedCount: number
  readonly conversionBps: number
  readonly acceptedCents: number
}

export interface DestinationRow {
  readonly destination: string
  readonly country: string | null
  readonly bookingsCount: number
  readonly paxCount: number
  readonly customersCount: number
  readonly revenueCents: number
  readonly costCents: number
  readonly marginCents: number
  readonly marginBps: number
  readonly averageTicketCents: number
}

export interface SupplierRow {
  readonly supplierId: string
  readonly supplierName: string
  readonly kind: Enums['supplier_kind']
  readonly servicesCount: number
  readonly bookingsCount: number
  readonly costCents: number
  readonly revenueCents: number
  readonly commissionCents: number
  readonly marginCents: number
  readonly marginBps: number
  readonly dueCents: number
  readonly paidCents: number
}

/** Chi non ha ancora un nome in anagrafica: una pratica senza operatore. */
export const SENZA_OPERATORE = 'Non assegnate'

type Riga = Record<string, unknown>

function righe(data: unknown): readonly Riga[] {
  return (data as readonly Riga[] | null) ?? []
}

const numero = (value: unknown): number => Number(value ?? 0)

export async function reportByOwner(from: string, to: string): Promise<readonly OwnerRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_by_owner', { p_from: from, p_to: to })
  if (error) throw new Error(`Report per operatore non disponibile: ${error.message}`)

  return righe(data).map((row) => ({
    ownerId: row.owner_id ? String(row.owner_id) : null,
    ownerName: row.owner_name ? String(row.owner_name) : SENZA_OPERATORE,
    bookingsCount: numero(row.bookings_count),
    paxCount: numero(row.pax_count),
    revenueCents: toCents(row.revenue_cents, 'venduto'),
    costCents: toCents(row.cost_cents, 'costo'),
    commissionCents: toCents(row.commission_cents, 'commissioni'),
    marginCents: toCents(row.margin_cents, 'margine'),
    marginBps: numero(row.margin_bps),
    averageTicketCents: toCents(row.average_ticket_cents, 'ticket medio'),
    collectedCents: toCents(row.collected_cents, 'incassato'),
    balanceCents: toCents(row.balance_cents, 'residuo'),
    cancelledCount: numero(row.cancelled_count),
  }))
}

export async function reportQuotesByOwner(
  from: string,
  to: string,
): Promise<readonly QuoteOwnerRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_quotes_by_owner', { p_from: from, p_to: to })
  if (error) throw new Error(`Conversione dei preventivi non disponibile: ${error.message}`)

  return righe(data).map((row) => ({
    ownerId: row.owner_id ? String(row.owner_id) : null,
    ownerName: row.owner_name ? String(row.owner_name) : SENZA_OPERATORE,
    quotesCount: numero(row.quotes_count),
    sentCount: numero(row.sent_count),
    acceptedCount: numero(row.accepted_count),
    convertedCount: numero(row.converted_count),
    rejectedCount: numero(row.rejected_count),
    conversionBps: numero(row.conversion_bps),
    acceptedCents: toCents(row.accepted_cents, 'valore accettato'),
  }))
}

export async function reportByDestination(
  from: string,
  to: string,
  limit = 50,
): Promise<readonly DestinationRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_by_destination', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  })
  if (error) throw new Error(`Report per destinazione non disponibile: ${error.message}`)

  return righe(data).map((row) => ({
    destination: String(row.destination ?? ''),
    country: row.country ? String(row.country) : null,
    bookingsCount: numero(row.bookings_count),
    paxCount: numero(row.pax_count),
    customersCount: numero(row.customers_count),
    revenueCents: toCents(row.revenue_cents, 'venduto'),
    costCents: toCents(row.cost_cents, 'costo'),
    marginCents: toCents(row.margin_cents, 'margine'),
    marginBps: numero(row.margin_bps),
    averageTicketCents: toCents(row.average_ticket_cents, 'ticket medio'),
  }))
}

export async function reportBySupplier(from: string, to: string): Promise<readonly SupplierRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_by_supplier', { p_from: from, p_to: to })
  if (error) throw new Error(`Report per fornitore non disponibile: ${error.message}`)

  return righe(data).map((row) => ({
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name ?? ''),
    kind: (row.kind as Enums['supplier_kind']) ?? 'altro',
    servicesCount: numero(row.services_count),
    bookingsCount: numero(row.bookings_count),
    costCents: toCents(row.cost_cents, 'acquistato'),
    revenueCents: toCents(row.revenue_cents, 'venduto'),
    commissionCents: toCents(row.commission_cents, 'commissioni'),
    marginCents: toCents(row.margin_cents, 'margine'),
    marginBps: numero(row.margin_bps),
    dueCents: toCents(row.due_cents, 'da pagare'),
    paidCents: toCents(row.paid_cents, 'pagato'),
  }))
}

export async function reportMonthly(from: string, to: string): Promise<readonly MonthlyPoint[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_monthly', { p_from: from, p_to: to })
  if (error) throw new Error(`Andamento del periodo non disponibile: ${error.message}`)

  return righe(data).map((row) => ({
    monthStart: String(row.month_start),
    revenueCents: toCents(row.revenue_cents, 'venduto'),
    marginCents: toCents(row.margin_cents, 'margine'),
    bookingsCount: numero(row.bookings_count),
  }))
}

/** Somma di una colonna: il totale della tabella è la somma di ciò che mostra. */
export function somma<T>(rows: readonly T[], campo: (row: T) => number): number {
  return rows.reduce((totale, row) => totale + campo(row), 0)
}
