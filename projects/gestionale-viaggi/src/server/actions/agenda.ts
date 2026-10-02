'use server'

import { revalidatePath } from 'next/cache'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { taskSchema } from '@/lib/validation/agenda'
import { requirePermission } from '@/server/session'

/**
 * Le attività dell'agenzia.
 *
 * Sono l'unica parte del gestionale che non nasce da un'operazione economica:
 * qualcuno si ricorda di una cosa e la scrive. Per questo qui non ci sono
 * vincoli fiscali, ma le stesse regole di sempre — validazione sul server,
 * permesso di scrittura, registro delle modifiche.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  const entries: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

/** Le pagine che un'attività cambia: l'agenda, la panoramica, la sua pratica. */
function aggiornaPagine(bookingId?: string | null) {
  revalidatePath('/agenda')
  revalidatePath('/')
  if (bookingId) revalidatePath(`/pratiche/${bookingId}`)
}

export async function saveTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const grezzo = formObject(formData)
  const parsed = taskSchema.safeParse(grezzo)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const id = grezzo.id
  const supabase = await createClient()
  const dati = {
    agency_id: session.agency.id,
    title: parsed.data.title,
    description: parsed.data.description,
    kind: parsed.data.kind,
    priority: parsed.data.priority,
    status: parsed.data.status,
    due_at: parsed.data.due_at,
    assignee_id: parsed.data.assignee_id,
    booking_id: parsed.data.booking_id,
    customer_id: parsed.data.customer_id,
  }

  if (isUuid(id)) {
    const { error } = await supabase.from('tasks').update(dati).eq('id', id)
    if (error) {
      return {
        status: 'error',
        message: 'Non siamo riusciti a salvare l’attività.',
        values: formValues(formData),
      }
    }

    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'modifica',
      p_entity_type: 'tasks',
      p_entity_id: id,
      p_entity_label: parsed.data.title,
      p_summary: 'Attività modificata',
    })

    aggiornaPagine(parsed.data.booking_id)
    return { status: 'success', message: 'Attività aggiornata.', values: { id } }
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...dati, created_by: session.membership.id })
    .select('id')
    .single()

  if (error || !data) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a creare l’attività.',
      values: formValues(formData),
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'tasks',
    p_entity_id: data.id,
    p_entity_label: parsed.data.title,
    p_summary: 'Attività creata',
  })

  aggiornaPagine(parsed.data.booking_id)
  return { status: 'success', message: 'Attività creata.', values: { id: data.id } }
}

export async function completeTaskAction(taskId: unknown): Promise<ActionState> {
  await requirePermission('write')
  if (!isUuid(taskId)) return { status: 'error', message: 'Attività non valida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_task', { p_task_id: taskId })

  if (error) return { status: 'error', message: 'Non siamo riusciti a completare l’attività.' }

  aggiornaPagine()
  return { status: 'success', message: 'Attività completata.' }
}

export async function reopenTaskAction(taskId: unknown): Promise<ActionState> {
  await requirePermission('write')
  if (!isUuid(taskId)) return { status: 'error', message: 'Attività non valida.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_task', { p_task_id: taskId })

  if (error) return { status: 'error', message: 'Non siamo riusciti a riaprire l’attività.' }

  aggiornaPagine()
  return { status: 'success', message: 'Attività riaperta.' }
}

/**
 * L'eliminazione è una cancellazione morbida: l'attività sparisce dagli
 * elenchi ma resta nel registro, come ogni altra cosa in questo gestionale.
 */
export async function deleteTaskAction(taskId: unknown): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(taskId)) return { status: 'error', message: 'Attività non valida.' }

  const supabase = await createClient()
  const { data: task } = await supabase
    .from('tasks')
    .select('title, booking_id')
    .eq('id', taskId)
    .maybeSingle()

  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return { status: 'error', message: 'Non siamo riusciti a eliminare l’attività.' }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'eliminazione',
    p_entity_type: 'tasks',
    p_entity_id: taskId,
    p_entity_label: task?.title ?? '',
    p_summary: 'Attività eliminata',
  })

  aggiornaPagine(task?.booking_id ?? null)
  return { status: 'success', message: 'Attività eliminata.' }
}
