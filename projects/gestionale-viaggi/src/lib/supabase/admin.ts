import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/**
 * Client con chiave di servizio: SCAVALCA la Row Level Security.
 *
 * Si usa solo dove non esiste una sessione utente e il controllo di accesso è'
 * già' stato fatto altrove: invio email di sistema, export programmati,
 * accettazione pubblica di un preventivo tramite token. Mai in un componente.
 */
export function createAdminClient() {
  const env = publicEnv()
  const secrets = serverEnv()
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, secrets.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
