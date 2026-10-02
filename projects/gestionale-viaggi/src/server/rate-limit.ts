import 'server-only'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/** Indirizzo del chiamante, dietro il proxy di Vercel. */
export async function clientIp(): Promise<string> {
  const headerList = await headers()
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'sconosciuto'
  return headerList.get('x-real-ip') ?? 'sconosciuto'
}

/**
 * Soglie configurabili per ambiente. I valori predefiniti sono quelli che
 * proteggono la produzione; una suite end-to-end, che apre decine di sessioni
 * in pochi secondi dallo stesso indirizzo, li alza attraverso queste variabili.
 */
const SOGLIE: Record<string, number | undefined> = {
  accesso: numero(process.env.LIMITE_ACCESSO),
  'magic-link': numero(process.env.LIMITE_MAGIC_LINK),
  recupero: numero(process.env.LIMITE_RECUPERO),
  registrazione: numero(process.env.LIMITE_REGISTRAZIONE),
}

function numero(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export interface RateLimitOptions {
  /** Nome della rotta, es. "accesso". */
  readonly action: string
  /** Chiave aggiuntiva (di solito l email), per non punire un intero ufficio. */
  readonly subject?: string
  readonly limit?: number
  readonly windowSeconds?: number
}

/**
 * Limita le richieste sulle rotte pubbliche. Il contatore sta sul database
 * (vedi migrazione 0007): su piattaforme serverless un contatore in memoria
 * verrebbe azzerato a ogni istanza e non limiterebbe nulla.
 *
 * In caso di errore del database la richiesta passa: un guasto del limitatore
 * non deve impedire l’accesso a chi ha diritto di entrare.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<boolean> {
  const { action, subject, limit = 8, windowSeconds = 300 } = options
  const soglia = SOGLIE[action] ?? limit
  const ip = await clientIp()
  const bucket = `${action}:${ip}${subject ? `:${subject}` : ''}`

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_bucket: bucket,
      p_limit: soglia,
      p_window_seconds: windowSeconds,
    })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}
