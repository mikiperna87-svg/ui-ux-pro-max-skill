import { z } from 'zod'

/**
 * Variabili d’ambiente validate una sola volta, al primo utilizzo.
 *
 * La validazione e' pigra di proposito: `next build` deve poter girare in CI
 * senza segreti, mentre una richiesta reale deve fallire subito e in modo
 * comprensibile se manca una chiave.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL non è un URL valido'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY mancante'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
})

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'SUPABASE_SERVICE_ROLE_KEY mancante'),
})

export type PublicEnv = z.infer<typeof publicSchema>
export type ServerEnv = z.infer<typeof serverSchema>

let publicCache: PublicEnv | null = null
let serverCache: ServerEnv | null = null

function fail(issues: z.ZodIssue[]): never {
  const detail = issues.map((issue) => `· ${issue.message}`).join('\n')
  throw new Error(
    `Configurazione incompleta. Controlla il file .env.local (vedi .env.example):\n${detail}`,
  )
}

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache
  const parsed = publicSchema.safeParse({
    // I riferimenti devono essere letterali: Next li sostituisce a build time.
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  })
  if (!parsed.success) fail(parsed.error.issues)
  publicCache = parsed.data
  return publicCache
}

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache
  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  if (!parsed.success) fail(parsed.error.issues)
  serverCache = parsed.data
  return serverCache
}

/** URL pubblico dell’applicazione, usato nei link delle email transazionali. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
