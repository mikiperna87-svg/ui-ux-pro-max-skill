import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Views } from '@/lib/database.types'

export type AgenziaPiattaforma = Views<'platform_agencies'>
export type MembroPiattaforma = Views<'platform_members'>

/**
 * L'elenco delle agenzie per chi amministra la piattaforma.
 *
 * Non c'è paginazione: le agenzie di un gestionale venduto a mano si contano
 * in decine, non in migliaia, e una tabella che ci sta tutta in una pagina si
 * legge meglio di una divisa in dieci. Il giorno in cui saranno tante, il
 * punto da cambiare è questo.
 */
export async function agenziePiattaforma(): Promise<readonly AgenziaPiattaforma[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_agencies')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return data ?? []
}

/** I membri di tutte le agenzie, raccolti per agenzia. */
export async function membriPiattaforma(): Promise<ReadonlyMap<string, readonly MembroPiattaforma[]>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('platform_members')
    .select('*')
    .order('created_at')

  const per = new Map<string, MembroPiattaforma[]>()
  for (const membro of data ?? []) {
    if (!membro.agency_id) continue
    const elenco = per.get(membro.agency_id) ?? []
    elenco.push(membro)
    per.set(membro.agency_id, elenco)
  }
  return per
}
