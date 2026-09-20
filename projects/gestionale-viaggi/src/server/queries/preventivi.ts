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

export type QuoteRow = Views<'quote_list'>
export type QuoteItemRow = Views<'quote_item_list'>
export type QuoteVariantTotals = Views<'quote_variant_totals'>

const IMPORTI_PREVENTIVO = ['revenue_cents', 'margin_cents'] as const
const IMPORTI_RIGA = [
  'unit_cost_cents',
  'unit_price_cents',
  'total_cost_cents',
  'total_price_cents',
  'commission_cents',
  'margin_cents',
  'taxable_cents',
  'vat_cents',
] as const
const IMPORTI_TOTALI = [
  'revenue_cents',
  'cost_cents',
  'commission_cents',
  'vat_cents',
  'margin_cents',
] as const

const STATI: readonly Enums['quote_status'][] = [
  'bozza',
  'inviato',
  'accettato',
  'rifiutato',
  'scaduto',
  'convertito',
]

function isStato(value: string | undefined): value is Enums['quote_status'] {
  return value !== undefined && (STATI as readonly string[]).includes(value)
}

// --- Elenco -------------------------------------------------------------------
export async function listQuotes(params: ListParams): Promise<ListResult<QuoteRow>> {
  const supabase = await createClient()
  const { from, to } = rangeFor(params)

  let query = supabase.from('quote_list').select('*', { count: 'exact' })

  if (params.search !== '') {
    const termine = params.search.replace(/[%*,().]/g, ' ').trim()
    query = query.or(`search_text.ilike.*${termine}*,customer_search.ilike.*${termine}*`)
  }
  if (isStato(params.filters.stato)) {
    // "scaduto" non è uno stato scritto sul database: è un inviato il cui
    // termine è passato, e si filtra sulla colonna derivata.
    if (params.filters.stato === 'scaduto') {
      query = query.eq('is_expired', true)
    } else {
      query = query.eq('status', params.filters.stato)
    }
  }
  if (params.filters.stato === 'aperti') {
    query = query.in('status', ['bozza', 'inviato'])
  }
  if (params.filters.operatore) {
    query = query.eq('owner_id', params.filters.operatore)
  }
  if (params.filters.cliente) {
    query = query.eq('customer_id', params.filters.cliente)
  }
  if (params.filters.validita === 'in_scadenza') {
    const fra7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    query = query
      .eq('status', 'inviato')
      .gte('valid_until', new Date().toISOString().slice(0, 10))
      .lte('valid_until', fra7)
  }

  const { data, error, count } = await query
    .order(params.sort ?? 'created_at', {
      ascending: params.direction === 'asc',
      nullsFirst: false,
    })
    .range(from, to)

  if (error) throw new Error(`Elenco preventivi non disponibile: ${error.message}`)

  const total = count ?? 0
  return {
    rows: (data ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_PREVENTIVO)),
    total,
    page: params.page,
    perPage: params.perPage,
    pageCount: pageCountFor(total, params.perPage),
  }
}

export async function allQuotesForExport(params: ListParams): Promise<readonly QuoteRow[]> {
  const result = await listQuotes({ ...params, page: 1, perPage: 5000 })
  return result.rows
}

// --- Scheda -------------------------------------------------------------------
export interface QuoteDetail {
  readonly quote: Tables<'quotes'>
  readonly summary: QuoteRow | null
  readonly items: readonly QuoteItemRow[]
  readonly totals: readonly QuoteVariantTotals[]
  readonly activity: readonly Tables<'activity_log'>[]
}

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!quote) return null

  const [{ data: summary }, { data: items }, { data: totals }, { data: activity }] =
    await Promise.all([
      supabase.from('quote_list').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('quote_item_list')
        .select('*')
        .eq('quote_id', id)
        .order('variant')
        .order('sort_order'),
      supabase.from('quote_variant_totals').select('*').eq('quote_id', id).order('variant'),
      supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'quotes')
        .eq('entity_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  return {
    quote,
    summary: summary ? importiInCentesimi(summary, IMPORTI_PREVENTIVO) : null,
    items: (items ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_RIGA)),
    totals: (totals ?? []).map((riga) => importiInCentesimi(riga, IMPORTI_TOTALI)),
    activity: activity ?? [],
  }
}

/** Importi di una variante, già in centesimi interi. */
export function variantAmounts(totale: QuoteVariantTotals | undefined) {
  return {
    revenue: toCents(totale?.revenue_cents, 'venduto della proposta'),
    cost: toCents(totale?.cost_cents, 'costo della proposta'),
    commission: toCents(totale?.commission_cents, 'commissioni della proposta'),
    vat: toCents(totale?.vat_cents, 'IVA della proposta'),
    margin: toCents(totale?.margin_cents, 'margine della proposta'),
    items: totale?.items_count ?? 0,
  }
}

// --- Pagina pubblica ----------------------------------------------------------
/**
 * Il preventivo visto da chi ha il collegamento.
 *
 * Usa il client normale, quindi il ruolo `anon`: le due funzioni interrogate
 * sono `security definer` e filtrano da sole su token e stato. Non serve la
 * chiave di servizio — che scavalcherebbe la RLS — perché non c'è niente da
 * scavalcare: il permesso è il token stesso.
 *
 * I tipi generati dalle funzioni sono tutti annullabili: PostgREST descrive
 * `returns table (...)` senza vincoli, anche dove le colonne di partenza non
 * lo sono. La normalizzazione avviene qui, una volta, così la pagina lavora su
 * valori certi invece di difendersi riga per riga.
 */
export interface QuotePublicItem {
  readonly variant: Enums['quote_variant']
  readonly service_type: Enums['service_type']
  readonly description: string
  readonly details: string | null
  readonly date_from: string | null
  readonly date_to: string | null
  readonly quantity: number
  readonly total_price_cents: number
}

export interface QuotePublic {
  readonly quote: {
    readonly id: string
    readonly code: string
    readonly title: string
    readonly destination: string
    readonly departure_date: string | null
    readonly return_date: string | null
    readonly pax_count: number
    readonly status: Enums['quote_status']
    readonly valid_until: string | null
    readonly intro_text: string | null
    readonly terms_text: string | null
    readonly accepted_variant: Enums['quote_variant'] | null
    readonly accepted_at: string | null
    readonly accepted_by_name: string | null
    readonly rejected_at: string | null
    readonly is_expired: boolean
    readonly customer_name: string | null
    readonly agency_name: string
    readonly agency_email: string | null
    readonly agency_phone: string | null
    readonly agency_vat: string | null
  }
  readonly items: readonly QuotePublicItem[]
}

export async function getQuotePublic(token: string): Promise<QuotePublic | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('quote_public', { p_token: token })
  if (error || !data || data.length === 0) return null

  const riga = data[0]
  if (!riga || riga.id === null || riga.status === null) return null

  const { data: items } = await supabase.rpc('quote_public_items', { p_token: token })

  return {
    quote: {
      id: riga.id,
      code: riga.code ?? '',
      title: riga.title ?? '',
      destination: riga.destination ?? '',
      departure_date: riga.departure_date,
      return_date: riga.return_date,
      pax_count: riga.pax_count ?? 1,
      status: riga.status,
      valid_until: riga.valid_until,
      intro_text: riga.intro_text,
      terms_text: riga.terms_text,
      accepted_variant: riga.accepted_variant,
      accepted_at: riga.accepted_at,
      accepted_by_name: riga.accepted_by_name,
      rejected_at: riga.rejected_at,
      is_expired: riga.is_expired ?? false,
      customer_name: riga.customer_name,
      agency_name: riga.agency_name ?? '',
      agency_email: riga.agency_email,
      agency_phone: riga.agency_phone,
      agency_vat: riga.agency_vat,
    },
    items: (items ?? []).flatMap((voce) =>
      voce.variant === null || voce.service_type === null
        ? []
        : [
            {
              variant: voce.variant,
              service_type: voce.service_type,
              description: voce.description ?? '',
              details: voce.details,
              date_from: voce.date_from,
              date_to: voce.date_to,
              quantity: voce.quantity ?? 1,
              total_price_cents: toCents(voce.total_price_cents, 'importo della riga'),
            },
          ],
    ),
  }
}
