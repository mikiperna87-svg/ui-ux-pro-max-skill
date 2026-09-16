'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { formatEuro } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import {
  bookingPassengerSchema,
  bookingSchema,
  bookingServiceSchema,
  cancelBookingSchema,
  savedViewSchema,
} from '@/lib/validation/pratiche'
import { requirePermission } from '@/server/session'

/**
 * Una Server Action è un endpoint HTTP: gli argomenti arrivano dalla rete e
 * possono essere qualunque cosa, non solo quello che il nostro componente
 * passa. Identificativi e stati si controllano qui, prima di toccare il
 * database.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * Gli stati che si possono impostare da un comando diretto. L'annullamento non
 * è fra questi di proposito: pretende un motivo e passa da cancel_booking.
 */
const STATI_AMMESSI = ['opzione', 'confermata', 'partita', 'rientrata'] as const
type StatoAmmesso = (typeof STATI_AMMESSI)[number]

const ENTITA_VISTE = ['pratiche', 'clienti', 'passeggeri', 'fornitori'] as const

function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  const entries: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

/** Traduce gli errori del database in messaggi che un operatore può capire. */
function databaseMessage(error: { code?: string; message: string }, entity: string): string {
  if (error.code === '23505' || error.message.includes('duplicate key')) {
    return `Esiste già ${entity} con questi dati.`
  }
  if (error.code === '23503') {
    return `${entity} è collegato ad altri dati e non può essere rimosso.`
  }
  if (error.code === '42501' || error.message.includes('row-level security')) {
    return 'Non hai i permessi per questa operazione.'
  }
  return `Non siamo riusciti a salvare ${entity}.`
}

/**
 * Le funzioni di dominio sollevano eccezioni con un messaggio già scritto per
 * chi legge: si mostra quello, non il testo tecnico di PostgREST.
 */
function rpcMessage(error: { message: string; code?: string }, fallback: string): string {
  const pulito = error.message.replace(/^.*?:\s*/, '').trim()
  return pulito.length > 0 && pulito.length < 200 ? pulito : fallback
}

// =============================================================================
// Pratica
// =============================================================================

export async function saveBookingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = bookingSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const payload = { ...parsed.data, agency_id: session.agency.id }

  if (typeof id === 'string' && id !== '') {
    const { error } = await supabase
      .from('bookings')
      .update(payload)
      .eq('id', id)
      .eq('agency_id', session.agency.id)

    if (error) return { status: 'error', message: databaseMessage(error, 'la pratica') }

    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'modifica',
      p_entity_type: 'bookings',
      p_entity_id: id,
      p_entity_label: payload.title,
      p_summary: 'Aggiornamento della pratica',
      p_before: null,
      p_after: null,
    })

    revalidatePath('/pratiche')
    revalidatePath(`/pratiche/${id}`)
    redirect(`/pratiche/${id}`)
  }

  // Una pratica nuova appartiene a chi la crea, salvo scelta diversa.
  const { data: created, error } = await supabase
    .from('bookings')
    .insert({
      ...payload,
      owner_id: payload.owner_id ?? session.membership.id,
      created_by: session.user.id,
      // Anno, numero e codice li assegna il trigger app.assign_booking_code con
      // il contatore transazionale: la numerazione non ha buchi e non dipende
      // dall'orologio di chi inserisce.
    })
    .select('id, code')
    .single()

  if (error || !created) {
    return { status: 'error', message: databaseMessage(error ?? { message: '' }, 'la pratica') }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'bookings',
    p_entity_id: created.id,
    p_entity_label: created.code,
    p_summary: 'Apertura di una nuova pratica',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/pratiche')
  redirect(`/pratiche/${created.id}`)
}

export async function confirmBookingAction(id: string): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(id)) return { status: 'error', message: 'Pratica non valida.' }
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('confirm_booking', { p_booking_id: id })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a confermare la pratica.'),
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'cambio_stato',
    p_entity_type: 'bookings',
    p_entity_id: id,
    p_entity_label: Array.isArray(data) ? null : ((data as { code?: string } | null)?.code ?? null),
    p_summary: 'Conferma della pratica: generate le scadenze e il controllo documenti',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/pratiche')
  revalidatePath(`/pratiche/${id}`)
  return { status: 'success', message: 'Pratica confermata: scadenze e controllo documenti creati.' }
}

export async function updateBookingStatusAction(
  id: string,
  status: StatoAmmesso,
): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(id)) return { status: 'error', message: 'Pratica non valida.' }
  if (!(STATI_AMMESSI as readonly string[]).includes(status)) {
    return { status: 'error', message: 'Stato non ammesso.' }
  }
  const supabase = await createClient()

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'la pratica') }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'cambio_stato',
    p_entity_type: 'bookings',
    p_entity_id: id,
    p_entity_label: null,
    p_summary: `Stato della pratica portato a "${status}"`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/pratiche')
  revalidatePath(`/pratiche/${id}`)
  return { status: 'success', message: 'Stato aggiornato.' }
}

export async function cancelBookingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const parsed = cancelBookingSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: parsed.data.booking_id,
    p_reason: parsed.data.reason,
    p_penalty_cents: parsed.data.penalty ?? 0,
  })

  if (error) {
    return { status: 'error', message: rpcMessage(error, 'Non siamo riusciti ad annullare la pratica.') }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'annullamento',
    p_entity_type: 'bookings',
    p_entity_id: parsed.data.booking_id,
    p_entity_label: null,
    p_summary: `Annullamento: ${parsed.data.reason} — penale ${formatEuro(parsed.data.penalty ?? 0)}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/pratiche')
  revalidatePath(`/pratiche/${parsed.data.booking_id}`)
  return { status: 'success', message: 'Pratica annullata.' }
}

export async function deleteBookingsAction(ids: readonly string[]): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!Array.isArray(ids) || ids.length === 0) {
    return { status: 'error', message: 'Nessuna pratica selezionata.' }
  }
  if (!ids.every(isUuid)) return { status: 'error', message: 'Selezione non valida.' }

  const supabase = await createClient()

  // Una pratica con incassi o fatture non si elimina: si annulla. Cancellarla
  // lascerebbe un buco nella numerazione e nella contabilità.
  const { data: vincolate } = await supabase
    .from('booking_list')
    .select('code, paid_cents')
    .in('id', ids)
    .gt('paid_cents', 0)

  if (vincolate && vincolate.length > 0) {
    return {
      status: 'error',
      message:
        'Almeno una pratica selezionata ha incassi registrati: quelle si annullano dalla scheda, non si eliminano.',
    }
  }

  const { error } = await supabase
    .from('bookings')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'la pratica') }

  for (const id of ids) {
    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'eliminazione',
      p_entity_type: 'bookings',
      p_entity_id: id,
      p_entity_label: null,
      p_summary: 'Eliminazione della pratica',
      p_before: null,
      p_after: null,
    })
  }

  revalidatePath('/pratiche')
  return {
    status: 'success',
    message: ids.length === 1 ? 'Pratica eliminata.' : `${ids.length} pratiche eliminate.`,
  }
}

// =============================================================================
// Righe di servizio
// =============================================================================

export async function saveBookingServiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = bookingServiceSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati della riga.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const {
    unit_cost,
    unit_price,
    commission_percent,
    commission_override,
    vat_percent,
    ...fields
  } = parsed.data

  const supabase = await createClient()
  const payload = {
    ...fields,
    agency_id: session.agency.id,
    unit_cost_cents: unit_cost ?? 0,
    unit_price_cents: unit_price ?? 0,
    commission_bps: commission_percent,
    commission_override_cents: commission_override,
    vat_bps: vat_percent,
  }

  if (typeof id === 'string' && id !== '') {
    const { error } = await supabase
      .from('booking_services')
      .update(payload)
      .eq('id', id)
      .eq('agency_id', session.agency.id)

    if (error) return { status: 'error', message: databaseMessage(error, 'la riga di servizio') }
  } else {
    const { error } = await supabase
      .from('booking_services')
      .insert({ ...payload, created_by: session.user.id })

    if (error) return { status: 'error', message: databaseMessage(error, 'la riga di servizio') }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: typeof id === 'string' && id !== '' ? 'modifica' : 'creazione',
    p_entity_type: 'booking_services',
    p_entity_id: typeof id === 'string' && id !== '' ? id : null,
    p_entity_label: payload.description,
    p_summary: `Riga di servizio: ${payload.description} — vendita ${formatEuro(payload.unit_price_cents * payload.quantity)}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath(`/pratiche/${parsed.data.booking_id}`)
  return { status: 'success', message: 'Riga salvata.' }
}

export async function deleteBookingServiceAction(
  id: string,
  bookingId: string,
): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(id) || !isUuid(bookingId)) {
    return { status: 'error', message: 'Riga non valida.' }
  }
  const supabase = await createClient()

  const { error } = await supabase
    .from('booking_services')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'la riga di servizio') }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'eliminazione',
    p_entity_type: 'booking_services',
    p_entity_id: id,
    p_entity_label: null,
    p_summary: 'Eliminazione di una riga di servizio',
    p_before: null,
    p_after: null,
  })

  revalidatePath(`/pratiche/${bookingId}`)
  return { status: 'success', message: 'Riga eliminata.' }
}

// =============================================================================
// Passeggeri della pratica
// =============================================================================

export async function addBookingPassengerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const parsed = bookingPassengerSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('booking_passengers')
    .insert({ ...parsed.data, agency_id: session.agency.id, created_by: session.user.id })

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', message: 'Questo passeggero è già nella pratica.' }
    }
    return { status: 'error', message: databaseMessage(error, 'il passeggero') }
  }

  revalidatePath(`/pratiche/${parsed.data.booking_id}`)
  return { status: 'success', message: 'Passeggero aggiunto alla pratica.' }
}

export async function removeBookingPassengerAction(
  id: string,
  bookingId: string,
): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(id) || !isUuid(bookingId)) {
    return { status: 'error', message: 'Passeggero non valido.' }
  }
  const supabase = await createClient()

  const { error } = await supabase
    .from('booking_passengers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'il passeggero') }

  revalidatePath(`/pratiche/${bookingId}`)
  return { status: 'success', message: 'Passeggero rimosso dalla pratica.' }
}

// =============================================================================
// Viste salvate degli elenchi
// =============================================================================

export async function saveViewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const parsed = savedViewSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  // Una vista condivisa la crea il titolare: gli altri salvano la propria.
  const condivisa = parsed.data.shared && session.membership.role === 'titolare'

  const supabase = await createClient()
  const { error } = await supabase.from('saved_views').insert({
    agency_id: session.agency.id,
    membership_id: condivisa ? null : session.membership.id,
    entity: parsed.data.entity,
    name: parsed.data.name,
    query: parsed.data.query,
    created_by: session.user.id,
  })

  if (error) {
    if (error.code === '23505') {
      return { status: 'error', message: 'Esiste già una vista con questo nome.' }
    }
    return { status: 'error', message: databaseMessage(error, 'la vista') }
  }

  revalidatePath(`/${parsed.data.entity}`)
  return { status: 'success', message: condivisa ? 'Vista salvata per tutta l’agenzia.' : 'Vista salvata.' }
}

export async function deleteViewAction(id: string, entity: string): Promise<ActionState> {
  await requirePermission('write')
  if (!isUuid(id) || !(ENTITA_VISTE as readonly string[]).includes(entity)) {
    return { status: 'error', message: 'Vista non valida.' }
  }
  const supabase = await createClient()

  const { error } = await supabase
    .from('saved_views')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { status: 'error', message: databaseMessage(error, 'la vista') }

  revalidatePath(`/${entity}`)
  return { status: 'success', message: 'Vista eliminata.' }
}
