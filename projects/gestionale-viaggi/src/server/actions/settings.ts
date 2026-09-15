'use server'

import { revalidatePath } from 'next/cache'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/env'
import { agencySchema, inviteSchema, memberUpdateSchema, settingsSchema } from '@/lib/validation/settings'
import type { Role } from '@/lib/roles'
import { requirePermission } from '@/server/session'


function formObject(formData: FormData): Record<string, FormDataEntryValue | boolean> {
  const entries: Record<string, FormDataEntryValue | boolean> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

export async function updateAgencyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission('settings')
  const parsed = agencySchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('agencies').update(parsed.data).eq('id', session.agency.id)

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a salvare i dati dell’agenzia.' }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'modifica',
    p_entity_type: 'agencies',
    p_entity_id: session.agency.id,
    p_entity_label: parsed.data.name,
    p_summary: 'Aggiornamento dei dati dell’agenzia',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/impostazioni')
  revalidatePath('/', 'layout')
  return { status: 'success', message: 'Dati dell’agenzia aggiornati.' }
}

export async function updateSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission('settings')
  const raw = formObject(formData)
  const parsed = settingsSchema.safeParse({
    ...raw,
    // Le caselle non selezionate non arrivano nel FormData.
    hide_margins_from_operators: formData.get('hide_margins_from_operators') === 'on',
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i parametri inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('agency_settings')
    .update(parsed.data)
    .eq('agency_id', session.agency.id)

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a salvare i parametri.' }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'modifica',
    p_entity_type: 'agency_settings',
    p_entity_id: session.settings.id,
    p_entity_label: session.agency.name,
    p_summary: 'Aggiornamento dei parametri operativi',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/impostazioni')
  return { status: 'success', message: 'Parametri aggiornati.' }
}

/**
 * Invito di un collaboratore: l’utente viene creato tramite l API di
 * amministrazione (chiave di servizio) e riceve una email per impostare la
 * password. La membership viene creata subito, così' al primo accesso trova
 * già' il suo ruolo.
 */
export async function inviteMemberAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission('settings')
  const parsed = inviteSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return {
      status: 'error',
      message:
        'Invito non disponibile: manca la chiave di servizio Supabase (SUPABASE_SERVICE_ROLE_KEY) nella configurazione.',
    }
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?successivo=${encodeURIComponent('/reimposta-password')}`,
    data: { full_name: parsed.data.full_name },
  })

  let userId = invited?.user?.id ?? null

  if (inviteError) {
    // Se l’utente esiste già', lo colleghiamo senza reinvitarlo.
    const { data: list } = await admin.auth.admin.listUsers()
    userId = list?.users.find((user) => user.email?.toLowerCase() === parsed.data.email)?.id ?? null
    if (!userId) {
      return { status: 'error', message: 'Non siamo riusciti a invitare questo indirizzo.' }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('memberships').insert({
    agency_id: session.agency.id,
    user_id: userId as string,
    role: parsed.data.role as Role,
    full_name: parsed.data.full_name,
    email: parsed.data.email,
    job_title: parsed.data.job_title || null,
    created_by: session.user.id,
  })

  if (error) {
    const duplicate = error.code === '23505'
    return {
      status: 'error',
      message: duplicate
        ? 'Questa persona fa già parte dell’agenzia.'
        : 'Non siamo riusciti a completare l’invito.',
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'memberships',
    p_entity_id: null,
    p_entity_label: parsed.data.email,
    p_summary: `Invito di ${parsed.data.full_name} come ${parsed.data.role}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/impostazioni')
  return { status: 'success', message: `Invito inviato a ${parsed.data.email}.` }
}

export async function updateMemberAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission('settings')
  const parsed = memberUpdateSchema.safeParse({
    membership_id: formData.get('membership_id'),
    role: formData.get('role'),
    is_active: formData.get('is_active') === 'on',
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Dati non validi.' }
  }

  const supabase = await createClient()

  // Non ci si può' togliere il ruolo di titolare da soli: l’agenzia resterebbe
  // senza nessuno in grado di gestirla.
  if (parsed.data.membership_id === session.membership.id && parsed.data.role !== 'titolare') {
    return { status: 'error', message: 'Non puoi rimuovere a te stesso il ruolo di titolare.' }
  }

  const { error } = await supabase
    .from('memberships')
    .update({ role: parsed.data.role as Role, is_active: parsed.data.is_active })
    .eq('id', parsed.data.membership_id)
    .eq('agency_id', session.agency.id)

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti ad aggiornare l’utente.' }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'modifica',
    p_entity_type: 'memberships',
    p_entity_id: parsed.data.membership_id,
    p_entity_label: null,
    p_summary: `Aggiornamento ruolo a ${parsed.data.role}${parsed.data.is_active ? '' : ' (disattivato)'}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/impostazioni')
  return { status: 'success', message: 'Utente aggiornato.' }
}
