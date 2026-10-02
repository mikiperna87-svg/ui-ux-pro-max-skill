import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Ritorno dai link inviati per email (magic link, conferma, recupero password).
 * Scambia il codice con una sessione e porta l’utente dove stava andando.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const rawNext = searchParams.get('successivo') ?? '/'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/errore?motivo=codice-mancante`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth/errore?motivo=link-scaduto`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
