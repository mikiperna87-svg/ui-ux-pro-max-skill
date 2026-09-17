import { describe, expect, it } from 'vitest'
import {
  buildListHref,
  DEFAULT_PAGE_SIZE,
  normalizeSearch,
  pageCountFor,
  parseListParams,
  rangeFor,
} from '@/lib/list-params'

const options = {
  sortable: ['display_name', 'created_at'],
  defaultSort: 'display_name',
  filterKeys: ['tipo', 'tag'],
} as const

describe('parseListParams', () => {
  it('applica i valori predefiniti quando la query è vuota', () => {
    const params = parseListParams({}, options)
    expect(params).toEqual({
      search: '',
      page: 1,
      perPage: DEFAULT_PAGE_SIZE,
      sort: 'display_name',
      direction: 'asc',
      filters: {},
    })
  })

  it('normalizza la ricerca come fa il database', () => {
    expect(parseListParams({ q: '  Città DI Malé ' }, options).search).toBe('citta di male')
  })

  it('ignora un ordinamento su una colonna non consentita', () => {
    expect(parseListParams({ ordina: 'password' }, options).sort).toBe('display_name')
    expect(parseListParams({ ordina: 'created_at', verso: 'desc' }, options)).toMatchObject({
      sort: 'created_at',
      direction: 'desc',
    })
  })

  it('scarta pagine e dimensioni non valide', () => {
    expect(parseListParams({ pagina: '0' }, options).page).toBe(1)
    expect(parseListParams({ pagina: 'tre' }, options).page).toBe(1)
    expect(parseListParams({ per: '999' }, options).perPage).toBe(DEFAULT_PAGE_SIZE)
    expect(parseListParams({ per: '100' }, options).perPage).toBe(100)
  })

  it('accetta solo i filtri dichiarati dal modulo', () => {
    const params = parseListParams({ tipo: 'azienda', sconosciuto: 'x' }, options)
    expect(params.filters).toEqual({ tipo: 'azienda' })
  })
})

describe('paginazione', () => {
  it('calcola l intervallo di righe per il database', () => {
    expect(rangeFor(parseListParams({ pagina: '1', per: '25' }, options))).toEqual({ from: 0, to: 24 })
    expect(rangeFor(parseListParams({ pagina: '3', per: '25' }, options))).toEqual({ from: 50, to: 74 })
  })

  it('conta le pagine, almeno una anche senza righe', () => {
    expect(pageCountFor(0, 50)).toBe(1)
    expect(pageCountFor(50, 50)).toBe(1)
    expect(pageCountFor(51, 50)).toBe(2)
  })
})

describe('buildListHref', () => {
  it('conserva i parametri esistenti e sostituisce quelli indicati', () => {
    const href = buildListHref('/clienti', { q: 'rossi', tipo: 'privato' }, { ordina: 'created_at' })
    expect(href).toContain('q=rossi')
    expect(href).toContain('tipo=privato')
    expect(href).toContain('ordina=created_at')
  })

  it('torna alla prima pagina quando cambia il filtro', () => {
    const href = buildListHref('/clienti', { pagina: '7' }, { tipo: 'azienda' })
    expect(href).not.toContain('pagina')
  })

  it('resta sulla pagina richiesta quando è la pagina a cambiare', () => {
    const href = buildListHref('/clienti', { q: 'rossi' }, { pagina: 4 })
    expect(href).toContain('pagina=4')
  })

  it('rimuove i parametri svuotati', () => {
    const href = buildListHref('/clienti', { q: 'rossi', tipo: 'privato' }, { tipo: null })
    expect(href).not.toContain('tipo')
    expect(href).toContain('q=rossi')
  })

  it('senza parametri restituisce il percorso nudo', () => {
    expect(buildListHref('/clienti', {}, {})).toBe('/clienti')
  })
})

describe('normalizeSearch', () => {
  it('coincide con la normalizzazione del database', () => {
    expect(normalizeSearch('Città')).toBe('citta')
    expect(normalizeSearch('MALÉ')).toBe('male')
    expect(normalizeSearch('  spazi  ')).toBe('spazi')
  })
})
