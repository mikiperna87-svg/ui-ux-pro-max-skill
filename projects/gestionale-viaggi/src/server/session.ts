import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { canSeeMargins, PERMISSIONS, type Role } from '@/lib/roles'
import type { Tables } from '@/lib/database.types'

export interface AppSession {
  readonly user: User
  readonly membership: Tables<'memberships'>
  readonly agency: Tables<'agencies'>
  readonly settings: Tables<'agency_settings'>
  readonly role: Role
  readonly permissions: {
    readonly write: boolean
    readonly accounting: boolean
    readonly settings: boolean
    readonly allBookings: boolean
    readonly margins: boolean
  }
}

/**
 * L'utente autenticato, verificato dal server una volta per richiesta.
 *
 * `getUser()` non legge il cookie: chiede al server di autenticazione se quel
 * token è ancora valido, ed è un viaggio di rete. Senza questa memoria
 * `requireSession()` ne faceva uno per ogni componente che la chiamava — nel
 * banco di prova, tredici per una sola apertura dell'elenco pratiche, contro
 * sei query di dati. `cache` di React le riduce a una: vale per la durata di
 * una richiesta, quindi non conserva nulla fra un utente e l'altro.
 */
const getUtente = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * Sessione applicativa completa (utente + agenzia + ruolo + parametri).
 * `cache` la risolve una sola volta per richiesta, anche se dieci componenti
 * la chiedono: e' il modo in cui evitiamo dieci query identiche per pagina.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const supabase = await createClient()

  const user = await getUtente()
  if (!user) return null

  const { data: membership } = await supabase
    .from('memberships')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const [{ data: agency }, { data: settings }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', membership.agency_id).single(),
    supabase.from('agency_settings').select('*').eq('agency_id', membership.agency_id).single(),
  ])

  if (!agency || !settings) return null

  const role = membership.role

  return {
    user,
    membership,
    agency,
    settings,
    role,
    permissions: {
      write: PERMISSIONS.write(role),
      accounting: PERMISSIONS.accounting(role),
      settings: PERMISSIONS.settings(role),
      allBookings: PERMISSIONS.allBookings(role),
      margins: canSeeMargins(role, settings.hide_margins_from_operators),
    },
  }
})

/** Sessione obbligatoria: senza, si torna al login o alla creazione agenzia. */
export async function requireSession(): Promise<AppSession> {
  const user = await getUtente()
  if (!user) redirect('/accedi')

  const session = await getSession()
  if (!session) redirect('/registrati')
  return session
}

export class PermessoNegatoError extends Error {
  constructor(message = 'Non hai i permessi per questa operazione.') {
    super(message)
    this.name = 'PermessoNegatoError'
  }
}

/** Guardia di ruolo per le Server Action: lancia invece di reindirizzare. */
export async function requirePermission(
  permission: keyof AppSession['permissions'],
): Promise<AppSession> {
  const session = await requireSession()
  if (!session.permissions[permission]) {
    throw new PermessoNegatoError()
  }
  return session
}
