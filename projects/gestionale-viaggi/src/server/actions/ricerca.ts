'use server'

import { createClient } from '@/lib/supabase/server'
import { normalizeSearch } from '@/lib/list-params'
import { requireSession } from '@/server/session'

export interface SearchHit {
  readonly id: string
  readonly href: string
  readonly label: string
  readonly hint: string
  /** Testo su cui il palinsesto filtra: gli stessi campi cercati sul database. */
  readonly terms: string
}

export interface SearchResults {
  readonly pratiche: readonly SearchHit[]
  readonly clienti: readonly SearchHit[]
  readonly passeggeri: readonly SearchHit[]
  readonly fornitori: readonly SearchHit[]
}

const VUOTO: SearchResults = { pratiche: [], clienti: [], passeggeri: [], fornitori: [] }

const PER_GRUPPO = 5

/**
 * Ricerca globale della tavolozza dei comandi.
 *
 * Interroga le stesse colonne `search_text` degli elenchi, quindi ignora
 * accenti e maiuscole e trova anche per email, telefono o codice fiscale. La
 * Row Level Security decide che cosa l'utente può vedere: qui non si filtra
 * per agenzia a mano, come in ogni altra query del progetto.
 */
export async function searchEverywhereAction(term: string): Promise<SearchResults> {
  await requireSession()

  const cercato = normalizeSearch(term)
  if (cercato.length < 2) return VUOTO

  const supabase = await createClient()
  const pattern = `%${cercato}%`

  const [pratiche, clienti, passeggeri, fornitori] = await Promise.all([
    supabase
      .from('booking_list')
      .select('id, code, destination, customer_name, departure_date, search_text')
      .ilike('search_text', pattern)
      .order('departure_date', { ascending: false, nullsFirst: false })
      .limit(PER_GRUPPO),
    supabase
      .from('customer_list')
      .select('id, display_name, email, city, search_text')
      .ilike('search_text', pattern)
      .order('display_name')
      .limit(PER_GRUPPO),
    supabase
      .from('passenger_list')
      .select('id, full_name, document_number, customer_name, search_text')
      .ilike('search_text', pattern)
      .order('full_name')
      .limit(PER_GRUPPO),
    supabase
      .from('supplier_list')
      .select('id, name, city, kind, search_text')
      .ilike('search_text', pattern)
      .order('name')
      .limit(PER_GRUPPO),
  ])

  return {
    pratiche: (pratiche.data ?? []).map((row) => ({
      id: row.id ?? '',
      href: `/pratiche/${row.id}`,
      label: `${row.code} · ${row.destination}`,
      hint: [row.customer_name, row.departure_date].filter(Boolean).join(' · '),
      terms: row.search_text ?? '',
    })),
    clienti: (clienti.data ?? []).map((row) => ({
      id: row.id ?? '',
      href: `/clienti/${row.id}`,
      label: row.display_name ?? '(senza nome)',
      hint: [row.email, row.city].filter(Boolean).join(' · '),
      terms: row.search_text ?? '',
    })),
    passeggeri: (passeggeri.data ?? []).map((row) => ({
      id: row.id ?? '',
      href: `/passeggeri/${row.id}`,
      label: row.full_name ?? '(senza nome)',
      hint: [row.customer_name, row.document_number].filter(Boolean).join(' · '),
      terms: row.search_text ?? '',
    })),
    fornitori: (fornitori.data ?? []).map((row) => ({
      id: row.id ?? '',
      href: `/fornitori/${row.id}`,
      label: row.name ?? '(senza nome)',
      hint: [row.city].filter(Boolean).join(' · '),
      terms: row.search_text ?? '',
    })),
  }
}
