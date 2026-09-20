import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/server/session'

export interface SavedViewRow {
  readonly id: string
  readonly name: string
  readonly query: string
  readonly shared: boolean
  readonly mine: boolean
}

/**
 * Viste salvate di un elenco: prima quelle condivise dall'agenzia, poi le
 * proprie. La RLS ha già escluso quelle degli altri.
 */
export async function savedViewsFor(
  entity: 'pratiche' | 'preventivi' | 'clienti' | 'passeggeri' | 'fornitori',
): Promise<readonly SavedViewRow[]> {
  const session = await requireSession()
  const supabase = await createClient()

  const { data } = await supabase
    .from('saved_views')
    .select('id, name, query, membership_id, sort_order')
    .eq('entity', entity)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    query: row.query,
    shared: row.membership_id === null,
    mine: row.membership_id === session.membership.id,
  }))
}
