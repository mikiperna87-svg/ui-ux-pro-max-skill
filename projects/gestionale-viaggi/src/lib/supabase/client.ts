'use client'

import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/database.types'

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

/** Client Supabase lato browser (singleton: una sola connessione realtime). */
export function createClient() {
  if (cached) return cached
  const env = publicEnv()
  cached = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  return cached
}
