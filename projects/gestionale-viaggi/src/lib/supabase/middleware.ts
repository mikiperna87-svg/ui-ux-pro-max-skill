import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/lib/database.types'

/** Rotte raggiungibili senza sessione. */
const PUBLIC_PATHS = [
  '/accedi',
  '/registrati',
  '/recupera-password',
  '/reimposta-password',
  '/auth/callback',
  '/auth/errore',
  '/preventivo',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/**
 * La politica sui contenuti, costruita attorno a un numero usa e getta.
 *
 * Il nonce cambia a ogni richiesta e autorizza soltanto gli script che il
 * server ha messo nella pagina: uno script iniettato — da un commento, da un
 * campo, da una dipendenza compromessa — non ce l'ha e il browser si rifiuta
 * di eseguirlo. È l'ultima rete sotto la validazione e la RLS, e l'unica che
 * lavora nel browser dell'utente.
 *
 * Gli stili restano su `unsafe-inline`: Radix e i grafici scrivono attributi
 * `style` calcolati a runtime, e un foglio di stile iniettato può imbruttire
 * una pagina, non esfiltrare dati. In sviluppo si aggiunge `unsafe-eval`,
 * senza il quale il ricaricamento a caldo di Next non funziona.
 */
function politicaContenuti(nonce: string, supabaseUrl: string, sviluppo: boolean): string {
  const script = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`]
  if (sviluppo) script.push(`'unsafe-eval'`)

  return [
    `default-src 'self'`,
    `script-src ${script.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    // Il gestionale parla solo con il proprio backend Supabase.
    `connect-src 'self' ${supabaseUrl} ${supabaseUrl.replace(/^http/, 'ws')}`,
    `frame-src 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Il gestionale non va incorniciato da nessuno: è la versione moderna di
    // X-Frame-Options, e vale anche dove quello non arriva.
    `frame-ancestors 'none'`,
    // Solo in produzione: in sviluppo si lavora in chiaro su localhost, e
    // chiedere al browser di promuovere tutto a HTTPS non protegge niente.
    ...(sviluppo ? [] : [`upgrade-insecure-requests`]),
  ].join('; ')
}

/**
 * Rinnova la sessione a ogni richiesta e protegge le rotte private.
 * I cookie vanno scritti sulla risposta restituita: e' l’unico punto in cui
 * Next permette di aggiornarli durante la navigazione.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = publicEnv()
  const sviluppo = process.env.NODE_ENV !== 'production'
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = politicaContenuti(nonce, env.NEXT_PUBLIC_SUPABASE_URL, sviluppo)

  // Le intestazioni viaggiano anche sulla *richiesta*: è da lì che Next legge
  // il nonce per firmare i propri script, e senza la pagina resterebbe muta.
  const intestazioni = new Headers(request.headers)
  intestazioni.set('x-nonce', nonce)
  intestazioni.set('content-security-policy', csp)

  const conIntestazioni = (risposta: NextResponse) => {
    risposta.headers.set('content-security-policy', csp)
    return risposta
  }

  let response = NextResponse.next({ request: { headers: intestazioni } })


  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request: { headers: intestazioni } })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    // L'indirizzo si costruisce da zero: partire da nextUrl.clone() e mutarne
    // la query non conserva in modo affidabile i parametri aggiunti.
    const destination = `${pathname}${search}`
    const query = pathname === '/' ? '' : `?successivo=${encodeURIComponent(destination)}`
    return conIntestazioni(NextResponse.redirect(new URL(`/accedi${query}`, request.url)))
  }

  if (user && (pathname === '/accedi' || pathname === '/registrati')) {
    return conIntestazioni(NextResponse.redirect(new URL('/', request.url)))
  }

  return conIntestazioni(response)
}
