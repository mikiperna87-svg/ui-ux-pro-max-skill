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
 * Rinnova la sessione a ogni richiesta e protegge le rotte private.
 * I cookie vanno scritti sulla risposta restituita: e' l’unico punto in cui
 * Next permette di aggiornarli durante la navigazione.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const env = publicEnv()

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
          response = NextResponse.next({ request })
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
    return NextResponse.redirect(new URL(`/accedi${query}`, request.url))
  }

  if (user && (pathname === '/accedi' || pathname === '/registrati')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}
