import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/**
 * Client Supabase per Server Component, Server Action e Route Handler.
 * Legge e rinnova la sessione dai cookie della richiesta corrente.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const env = publicEnv()

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // I Server Component non possono scrivere cookie: se ne occupa il
          // middleware, che rinnova la sessione a ogni richiesta.
        }
      },
    },
  })
}
