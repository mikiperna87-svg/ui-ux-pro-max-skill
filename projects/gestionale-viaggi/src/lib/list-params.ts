/**
 * Stato delle griglie dati nell'indirizzo della pagina.
 *
 * Ricerca, ordinamento, pagina e filtri vivono nella query string: un elenco
 * filtrato si può mettere fra i preferiti, condividere con un collega e
 * ritrovare col tasto "indietro". Nessuno di questi stati sta in memoria.
 */
export const PAGE_SIZES = [25, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 50

export interface ListParams {
  /** Testo cercato, già normalizzato. */
  readonly search: string
  /** Pagina, a partire da 1. */
  readonly page: number
  readonly perPage: number
  readonly sort: string | null
  readonly direction: 'asc' | 'desc'
  /** Filtri specifici del modulo (stato, tipo, tag...). */
  readonly filters: Readonly<Record<string, string>>
}

export interface ListResult<T> {
  readonly rows: readonly T[]
  readonly total: number
  readonly page: number
  readonly perPage: number
  readonly pageCount: number
}

/** Minuscolo e senza accenti: stessa forma di app.normalize() sul database. */
export function normalizeSearch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export interface ParseListParamsOptions {
  /** Colonne su cui l'ordinamento è consentito: tutto il resto viene ignorato. */
  readonly sortable: readonly string[]
  readonly defaultSort?: string
  readonly defaultDirection?: 'asc' | 'desc'
  /** Nomi dei filtri accettati dal modulo. */
  readonly filterKeys?: readonly string[]
}

type RawParams = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/** Legge i parametri della griglia, scartando tutto ciò che non è previsto. */
export function parseListParams(raw: RawParams, options: ParseListParamsOptions): ListParams {
  const requestedSort = single(raw.ordina)
  const sort = options.sortable.includes(requestedSort)
    ? requestedSort
    : (options.defaultSort ?? null)

  const requestedDirection = single(raw.verso)
  const direction =
    requestedDirection === 'asc' || requestedDirection === 'desc'
      ? requestedDirection
      : (options.defaultDirection ?? 'asc')

  const pageNumber = Number.parseInt(single(raw.pagina), 10)
  const perPageNumber = Number.parseInt(single(raw.per), 10)

  const filters: Record<string, string> = {}
  for (const key of options.filterKeys ?? []) {
    const value = single(raw[key])
    if (value !== '') filters[key] = value
  }

  return {
    search: normalizeSearch(single(raw.q)),
    page: Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    perPage: (PAGE_SIZES as readonly number[]).includes(perPageNumber)
      ? perPageNumber
      : DEFAULT_PAGE_SIZE,
    sort,
    direction,
    filters,
  }
}

/** Intervallo di righe da chiedere al database per la pagina corrente. */
export function rangeFor(params: ListParams): { from: number; to: number } {
  const from = (params.page - 1) * params.perPage
  return { from, to: from + params.perPage - 1 }
}

export function pageCountFor(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage))
}

/** Costruisce l'indirizzo di una griglia partendo dai parametri correnti. */
export function buildListHref(
  pathname: string,
  current: Readonly<Record<string, string>>,
  changes: Readonly<Record<string, string | number | null>>,
): string {
  const params = new URLSearchParams(current)

  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') params.delete(key)
    else params.set(key, String(value))
  }

  // Cambiare ricerca, filtri o ordinamento riporta alla prima pagina:
  // restare alla dodicesima su un elenco di tre righe non aiuta nessuno.
  if (!('pagina' in changes)) params.delete('pagina')

  const query = params.toString()
  return query === '' ? pathname : `${pathname}?${query}`
}
