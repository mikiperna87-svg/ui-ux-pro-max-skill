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
import { importiInCentesimi } from '@/server/queries/incassi'

export type InvoiceRow = Views<'invoice_list'>
export type InvoiceItemRow = Views<'invoice_item_list'>
export type VatRegisterRow = Views<'vat_register'>

const IMPORTI_DOCUMENTO = [
  'taxable_cents',
  'vat_cents',
  'total_cents',
  'signed_total_cents',
  'paid_cents',
  'residual_cents',
  'credited_cents',
] as const

const IMPORTI_RIGA = [
  'unit_price_cents',
  'cost_cents',
  'gross_cents',
  'taxable_cents',
  'vat_cents',
  'margin_cents',
] as const

const IMPORTI_REGISTRO = ['taxable_cents', 'vat_cents', 'total_cents', 'margin_cents'] as const

/**
 * I totali scritti sulla riga della fattura.
 *
 * Sono bigint: PostgREST li consegna come stringa oltre i 2^53, e una stringa
 * concatenata al posto di una somma è il tipo di errore che si scopre su una
 * fattura. Si normalizzano qui, al confine.
 */
const IMPORTI_TESTATA = ['taxable_cents', 'vat_cents', 'total_cents'] as const

const STATI: readonly Enums['invoice_status'][] = [
  'bozza',
  'emessa',
  'inviata',
  'pagata',
  'annullata',
]

function isStato(value: string | undefined): value is Enums['invoice_status'] {
  return value !== undefined && (STATI as readonly string[]).includes(value)
}

// --- Elenco -------------------------------------------------------------------
export async function listInvoices(params: ListParams): Promise<ListResult<InvoiceRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('invoice_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    const termine = params.search.replace(/[%*,().]/g, ' ').trim()
    query = query.or(`search_text.ilike.*${termine}*,customer_search.ilike.*${termine}*`)
  }
  if (params.filters.tipo === 'fattura' || params.filters.tipo === 'nota_credito') {
    query = query.eq('kind', params.filters.tipo)
  }
  if (isStato(params.filters.stato)) {
    query = query.eq('status', params.filters.stato)
  }
  if (params.filters.pagamento === 'da_incassare') {
    query = query.in('payment_state', ['da_incassare', 'parziale'])
  }
  if (params.filters.pagamento === 'pagata') {
    query = query.eq('payment_state', 'pagata')
  }
  if (params.filters.pagamento === 'in_ritardo') {
    query = query.eq('is_overdue', true)
  }
  if (params.filters.cliente) {
    query = query.eq('customer_id', params.filters.cliente)
  }
  if (params.filters.anno && /^\d{4}$/.test(params.filters.anno)) {
    query = query
      .gte('issue_date', `${params.filters.anno}-01-01`)
      .lte('issue_date', `${params.filters.anno}-12-31`)
  }
  if (params.filters.da) query = query.gte('issue_date', params.filters.da)
  if (params.filters.a) query = query.lte('issue_date', params.filters.a)

  const { data, error, count } = await query
    .order(params.sort ?? 'issue_date', {
      ascending: params.direction === 'asc',
      nullsFirst: false,
    })
    .order('number', { ascending: params.direction === 'asc', nullsFirst: false })
    .range(from, to)

  if (error) throw new Error(`Elenco fatture non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_DOCUMENTO)),
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

export async function allInvoicesForExport(params: ListParams): Promise<readonly InvoiceRow[]> {
  const result = await listInvoices({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

/** Totali della selezione corrente, per la riga di indicatori in cima. */
export async function totaliFatture(params: ListParams): Promise<{
  readonly documenti: number
  readonly imponibile: number
  readonly iva: number
  readonly totale: number
  readonly daIncassare: number
}> {
  const rows = await allInvoicesForExport(params)

  return rows.reduce(
    (somma, riga) => {
      const segno = riga.kind === 'nota_credito' ? -1 : 1
      return {
        documenti: somma.documenti + 1,
        imponibile: somma.imponibile + segno * toCents(riga.taxable_cents, 'imponibile'),
        iva: somma.iva + segno * toCents(riga.vat_cents, 'IVA'),
        totale: somma.totale + segno * toCents(riga.total_cents, 'totale'),
        daIncassare:
          somma.daIncassare +
          (riga.kind === 'fattura' && riga.status !== 'bozza'
            ? toCents(riga.residual_cents, 'residuo')
            : 0),
      }
    },
    { documenti: 0, imponibile: 0, iva: 0, totale: 0, daIncassare: 0 },
  )
}

// --- Scheda -------------------------------------------------------------------
export interface InvoiceDetail {
  readonly invoice: Tables<'invoices'>
  readonly summary: InvoiceRow | null
  readonly items: readonly InvoiceItemRow[]
  readonly creditNotes: readonly InvoiceRow[]
  readonly activity: readonly Tables<'activity_log'>[]
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!invoice) return null

  const [{ data: summary }, { data: items }, { data: creditNotes }, { data: activity }] =
    await Promise.all([
      supabase.from('invoice_list').select('*').eq('id', id).maybeSingle(),
      supabase.from('invoice_item_list').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('invoice_list').select('*').eq('credit_note_of', id).order('issue_date'),
      supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'invoices')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  return {
    invoice: importiInCentesimi(invoice, IMPORTI_TESTATA),
    summary: summary ? importiInCentesimi(summary, IMPORTI_DOCUMENTO) : null,
    items: (items ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_RIGA)),
    creditNotes: (creditNotes ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_DOCUMENTO)),
    activity: activity ?? [],
  }
}

/** Le fatture di una pratica, per la scheda della pratica. */
export async function invoicesForBooking(bookingId: string): Promise<readonly InvoiceRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoice_list')
    .select('*')
    .eq('booking_id', bookingId)
    .order('issue_date')

  return (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_DOCUMENTO))
}

// --- Registro IVA -------------------------------------------------------------
export interface RegisterRow {
  readonly month: number
  readonly kind: Enums['invoice_kind']
  readonly vat_regime: Enums['vat_regime']
  readonly vat_bps: number
  readonly documents_count: number
  readonly taxable_cents: number
  readonly vat_cents: number
  readonly total_cents: number
  readonly margin_cents: number
}

export interface VatRegister {
  readonly year: number
  readonly years: readonly number[]
  readonly rows: readonly RegisterRow[]
  readonly totals: {
    readonly documenti: number
    readonly imponibile: number
    readonly iva: number
    readonly totale: number
    readonly margine: number
  }
}

/**
 * Registro IVA delle vendite di un anno.
 *
 * Le righe arrivano già aggregate dal database: qui si normalizzano gli importi
 * e si calcolano i totali di colonna, che sono quelli che si riportano sulla
 * liquidazione.
 */
export async function vatRegister(year: number): Promise<VatRegister> {
  const supabase = await createClient()

  const [{ data, error }, { data: anni }] = await Promise.all([
    supabase
      .from('vat_register')
      .select('*')
      .eq('year', year)
      .order('month')
      .order('kind')
      .order('vat_bps'),
    supabase
      .from('invoice_list')
      .select('year')
      .not('year', 'is', null)
      .order('year', { ascending: false }),
  ])

  if (error) throw new Error(`Registro IVA non disponibile: ${error.message}`)

  const rows: RegisterRow[] = (data ?? [])
    .filter(
      (riga): riga is VatRegisterRow & { month: number; kind: Enums['invoice_kind'] } =>
        riga.month !== null && riga.kind !== null,
    )
    .map((riga) => {
      const importi = importiInCentesimi(riga, IMPORTI_REGISTRO)
      return {
        month: riga.month,
        kind: riga.kind,
        vat_regime: riga.vat_regime ?? 'ordinaria',
        vat_bps: riga.vat_bps ?? 0,
        documents_count: riga.documents_count ?? 0,
        taxable_cents: importi.taxable_cents ?? 0,
        vat_cents: importi.vat_cents ?? 0,
        total_cents: importi.total_cents ?? 0,
        margin_cents: importi.margin_cents ?? 0,
      }
    })

  const totals = rows.reduce(
    (somma, riga) => ({
      documenti: somma.documenti + riga.documents_count,
      imponibile: somma.imponibile + riga.taxable_cents,
      iva: somma.iva + riga.vat_cents,
      totale: somma.totale + riga.total_cents,
      // Il margine è la base imponibile del solo 74-ter. Fuori da quel regime
      // la differenza fra corrispettivo e costo esiste come numero ma non
      // significa niente per l'IVA, e sommarla falserebbe il totale.
      margine:
        somma.margine + (riga.vat_regime === 'art_74_ter' ? riga.margin_cents : 0),
    }),
    { documenti: 0, imponibile: 0, iva: 0, totale: 0, margine: 0 },
  )

  const elencoAnni = [
    ...new Set(
      (anni ?? [])
        .map((riga) => riga.year)
        .filter((valore): valore is number => typeof valore === 'number'),
    ),
  ].sort((a, b) => b - a)

  return {
    year,
    years: elencoAnni.length > 0 ? elencoAnni : [year],
    rows,
    totals,
  }
}

/**
 * Pratiche selezionabili quando si crea una fattura a mano.
 *
 * I clienti li fornisce già `customerOptions` in queries/anagrafiche: due
 * elenchi della stessa cosa divergerebbero al primo filtro aggiunto.
 */
export async function bookingOptions(
  customerId?: string | null,
): Promise<ReadonlyArray<{ id: string; label: string }>> {
  const supabase = await createClient()
  let query = supabase
    .from('bookings')
    .select('id, code, destination, customer_id')
    .is('deleted_at', null)
    .neq('status', 'annullata')
    .order('created_at', { ascending: false })
    .limit(500)

  if (customerId) query = query.eq('customer_id', customerId)

  const { data } = await query
  return (data ?? []).map((riga) => ({
    id: riga.id,
    label: `${riga.code ?? ''} · ${riga.destination}`.trim(),
  }))
}
