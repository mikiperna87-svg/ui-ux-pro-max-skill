'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldErrorsFrom, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'
import { checkRateLimit } from '@/server/rate-limit'
import {
  magicLinkSchema,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'

/** Destinazione interna sicura: mai un redirect verso un dominio esterno. */
function safeNext(value: FormDataEntryValue | null): string {
  const candidate = typeof value === 'string' ? value : ''
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/'
}

export async function signInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    successivo: formData.get('successivo'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Controlla i dati inseriti.', fieldErrors: fieldErrorsFrom(parsed.error.issues) }
  }

  const allowed = await checkRateLimit({ action: 'accesso', subject: parsed.data.email, limit: 8, windowSeconds: 300 })
  if (!allowed) {
    return {
      status: 'error',
      message: 'Troppi tentativi di accesso. Riprova fra qualche minuto.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Messaggio volutamente generico: non riveliamo se l email esiste.
    return { status: 'error', message: 'Email o password non corretti.' }
  }

  revalidatePath('/', 'layout')
  redirect(safeNext(formData.get('successivo')))
}

export async function magicLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get('email'),
    successivo: formData.get('successivo'),
  })

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error.issues) }
  }

  const allowed = await checkRateLimit({ action: 'magic-link', subject: parsed.data.email, limit: 4, windowSeconds: 600 })
  if (!allowed) {
    return { status: 'error', message: 'Troppe richieste. Riprova fra qualche minuto.' }
  }

  const next = safeNext(formData.get('successivo'))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback?successivo=${encodeURIComponent(next)}`,
    },
  })

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a inviare il link. Riprova.' }
  }

  return {
    status: 'success',
    message: 'Ti abbiamo inviato un link di accesso. Controlla la posta.',
  }
}

export async function requestPasswordResetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error.issues) }
  }

  const allowed = await checkRateLimit({ action: 'recupero', subject: parsed.data.email, limit: 4, windowSeconds: 900 })
  if (!allowed) {
    return { status: 'error', message: 'Troppe richieste. Riprova fra qualche minuto.' }
  }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?successivo=${encodeURIComponent('/reimposta-password')}`,
  })

  // Risposta identica in ogni caso: non confermiamo l esistenza dell’account.
  return {
    status: 'success',
    message: 'Se l’indirizzo è registrato, riceverai le istruzioni per reimpostare la password.',
  }
}

export async function updatePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get('password'),
    conferma: formData.get('conferma'),
  })

  if (!parsed.success) {
    return { status: 'error', fieldErrors: fieldErrorsFrom(parsed.error.issues) }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { status: 'error', message: 'Il link non è più valido. Richiedi un nuovo messaggio.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { status: 'error', message: 'Non siamo riusciti ad aggiornare la password.' }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signUpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    agencyName: formData.get('agencyName'),
    fullName: formData.get('fullName'),
    vatNumber: formData.get('vatNumber'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Controlla i dati inseriti.', fieldErrors: fieldErrorsFrom(parsed.error.issues) }
  }

  const allowed = await checkRateLimit({ action: 'registrazione', limit: 5, windowSeconds: 3600 })
  if (!allowed) {
    return { status: 'error', message: 'Troppe registrazioni da questo indirizzo. Riprova più tardi.' }
  }

  const supabase = await createClient()

  // Se l’utente ha già' una sessione (invito, magic link) creiamo solo l’agenzia.
  const {
    data: { user: existing },
  } = await supabase.auth.getUser()

  if (!existing) {
    const { error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback`,
        data: { full_name: parsed.data.fullName },
      },
    })

    if (signUpError) {
      return { status: 'error', message: 'Non siamo riusciti a creare l’account. Verifica l’indirizzo email.' }
    }

    const {
      data: { user: created },
    } = await supabase.auth.getUser()

    if (!created) {
      return {
        status: 'success',
        message:
          'Ti abbiamo inviato un messaggio per confermare l’indirizzo. Dopo la conferma potrai completare la creazione dell’agenzia.',
      }
    }
  }

  const { error: rpcError } = await supabase.rpc('create_agency_with_owner', {
    p_agency_name: parsed.data.agencyName,
    p_full_name: parsed.data.fullName,
    p_vat_number: parsed.data.vatNumber || null,
    p_email: parsed.data.email,
  })

  if (rpcError) {
    const alreadyMember = rpcError.message.includes('appartiene già')
    return {
      status: 'error',
      message: alreadyMember
        ? 'Questo utente è già collegato a un’agenzia. Accedi con le tue credenziali.'
        : 'Non siamo riusciti a creare l’agenzia. Riprova.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  revalidatePath('/', 'layout')
  redirect('/accedi')
}

/** Chiude la sessione su tutti i dispositivi: utile se si perde il telefono. */
export async function signOutEverywhereAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'global' })
  revalidatePath('/', 'layout')
  redirect('/accedi?disconnesso=tutti')
}
