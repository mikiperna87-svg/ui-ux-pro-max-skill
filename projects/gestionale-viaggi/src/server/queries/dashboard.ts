import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Enums, Tables } from '@/lib/database.types'

export interface DashboardKpis {
  readonly bookingsCount: number
  readonly confirmedCount: number
  readonly revenueCents: number
  readonly costCents: number
  readonly marginCents: number
  readonly marginBps: number
  readonly averageTicketCents: number
  readonly collectedCents: number
  readonly receivableCents: number
  readonly overdueCents: number
  readonly supplierDueCents: number
}

export interface UpcomingDeparture {
  readonly bookingId: string
  readonly code: string
  readonly title: string
  readonly destination: string
  readonly departureDate: string
  readonly returnDate: string | null
  readonly paxCount: number
  readonly status: Enums['booking_status']
  readonly customerName: string
  readonly ownerName: string | null
  readonly revenueCents: number
  readonly balanceCents: number
  readonly paymentState: Enums['payment_state']
}

export interface SupplierPayment {
  readonly paymentId: string
  readonly supplierName: string
  readonly bookingCode: string | null
  readonly amountCents: number
  readonly dueDate: string
  readonly status: Enums['payout_status']
  readonly daysLeft: number
}

export interface MonthlyPoint {
  readonly monthStart: string
  readonly revenueCents: number
  readonly marginCents: number
  readonly bookingsCount: number
}

const EMPTY_KPIS: DashboardKpis = {
  bookingsCount: 0,
  confirmedCount: 0,
  revenueCents: 0,
  costCents: 0,
  marginCents: 0,
  marginBps: 0,
  averageTicketCents: 0,
  collectedCents: 0,
  receivableCents: 0,
  overdueCents: 0,
  supplierDueCents: 0,
}

/**
 * Tutti gli indicatori con una sola chiamata: l aggregazione avviene sul
 * database, che è l’unico posto in cui può essere veloce su migliaia di righe.
 */
export async function getDashboardKpis(from: string, to: string, ownerId?: string | null): Promise<DashboardKpis> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_kpis', {
    p_from: from,
    p_to: to,
    p_owner_id: ownerId ?? null,
  })

  if (error) throw new Error(`Indicatori non disponibili: ${error.message}`)

  const row = (data as unknown as readonly Record<string, number>[] | null)?.[0]
  if (!row) return EMPTY_KPIS

  return {
    bookingsCount: Number(row.bookings_count ?? 0),
    confirmedCount: Number(row.confirmed_count ?? 0),
    revenueCents: Number(row.revenue_cents ?? 0),
    costCents: Number(row.cost_cents ?? 0),
    marginCents: Number(row.margin_cents ?? 0),
    marginBps: Number(row.margin_bps ?? 0),
    averageTicketCents: Number(row.average_ticket_cents ?? 0),
    collectedCents: Number(row.collected_cents ?? 0),
    receivableCents: Number(row.receivable_cents ?? 0),
    overdueCents: Number(row.overdue_cents ?? 0),
    supplierDueCents: Number(row.supplier_due_cents ?? 0),
  }
}

export async function getUpcomingDepartures(
  days = 30,
  limit = 8,
  ownerId?: string | null,
): Promise<readonly UpcomingDeparture[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('upcoming_departures', {
    p_days: days,
    p_limit: limit,
    p_owner_id: ownerId ?? null,
  })

  if (error) throw new Error(`Partenze non disponibili: ${error.message}`)

  return ((data as unknown as readonly Record<string, unknown>[] | null) ?? []).map((row) => ({
    bookingId: String(row.booking_id),
    code: String(row.code),
    title: String(row.title),
    destination: String(row.destination),
    departureDate: String(row.departure_date),
    returnDate: row.return_date ? String(row.return_date) : null,
    paxCount: Number(row.pax_count ?? 0),
    status: row.status as Enums['booking_status'],
    customerName: String(row.customer_name ?? ''),
    ownerName: row.owner_name ? String(row.owner_name) : null,
    revenueCents: Number(row.revenue_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0),
    paymentState: row.payment_state as Enums['payment_state'],
  }))
}

export async function getSupplierPayments(days = 14, limit = 8): Promise<readonly SupplierPayment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('upcoming_supplier_payments', {
    p_days: days,
    p_limit: limit,
  })

  if (error) throw new Error(`Scadenze fornitore non disponibili: ${error.message}`)

  return ((data as unknown as readonly Record<string, unknown>[] | null) ?? []).map((row) => ({
    paymentId: String(row.payment_id),
    supplierName: String(row.supplier_name ?? ''),
    bookingCode: row.booking_code ? String(row.booking_code) : null,
    amountCents: Number(row.amount_cents ?? 0),
    dueDate: String(row.due_date),
    status: row.status as Enums['payout_status'],
    daysLeft: Number(row.days_left ?? 0),
  }))
}

export async function getMonthlyTrend(months = 12, ownerId?: string | null): Promise<readonly MonthlyPoint[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('monthly_trend', {
    p_months: months,
    p_owner_id: ownerId ?? null,
  })

  if (error) throw new Error(`Andamento non disponibile: ${error.message}`)

  return ((data as unknown as readonly Record<string, unknown>[] | null) ?? []).map((row) => ({
    monthStart: String(row.month_start),
    revenueCents: Number(row.revenue_cents ?? 0),
    marginCents: Number(row.margin_cents ?? 0),
    bookingsCount: Number(row.bookings_count ?? 0),
  }))
}

export async function getRecentActivity(limit = 8): Promise<readonly Tables<'activity_log'>[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Registro attività non disponibile: ${error.message}`)
  return data ?? []
}
