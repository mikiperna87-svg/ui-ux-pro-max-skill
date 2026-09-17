'use server'

import { revalidatePath } from 'next/cache'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { formatEuro } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import {
  installmentSchema,
  paymentInSchema,
  payoutSchema,
  payoutStatusSchema,
  voidPaymentSchema,
} from '@/lib/validation/incassi'
import { requirePermission } from '@/server/session'

/**
 * Una Server Action è un endpoint HTTP: gli argomenti arrivano dalla rete.
 * Qui si muove denaro, quindi ogni identificativo e ogni stato si controllano
 * prima di toccare il database, senza fidarsi dei tipi TypeScript, che a
 * runtime non esistono.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

const STATI_PAGAMENTO = ['da_pagare', 'programmato', 'pagato', 'stornato'] as const
type StatoPagamento = (typeof STATI_PAGAMENTO)[number]

function isStatoPagamento(value: unknown): value is StatoPagamento {
  return typeof value === 'string' && (STATI_PAGAMENTO as readonly string[]).includes(value)
}

function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  const entries: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

/**
 * Le funzioni di dominio sollevano eccezioni con un messaggio già scritto per
 * chi legge: si mostra quello, non il testo tecnico di PostgREST.
 */
function rpcMessage(error: { message: string; code?: string }, fallback: string): string {
  const pulito = error.message.replace(/^.*?:\s*/, '').trim()
  return pulito.length > 0 && pulito.length < 200 ? pulito : fallback
}

function aggiornaPagine(bookingId: string) {
  revalidatePath('/scadenzario')
  revalidatePath('/pratiche')
  revalidatePath(`/pratiche/${bookingId}`)
  revalidatePath('/')
}

// =============================================================================
// Incassi
// =============================================================================

export async function recordPaymentInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')
  const parsed = paymentInSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_payment_in', {
    p_booking_id: parsed.data.booking_id,
    p_amount_cents: parsed.data.amount ?? 0,
    p_paid_at: parsed.data.paid_at,
    p_kind: parsed.data.kind,
    p_method: parsed.data.method,
    p_installment_id: parsed.data.installment_id,
    p_reference: parsed.data.reference,
    p_notes: parsed.data.notes,
    // Chiave d'idempotenza: il doppio clic su "Registra" non deve diventare un
    // doppio incasso. Identifica il movimento, non il momento del clic.
    p_idempotency_key: [
      parsed.data.booking_id,
      parsed.data.paid_at,
      parsed.data.amount ?? 0,
      parsed.data.kind,
      parsed.data.reference ?? '',
    ].join('|'),
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a registrare l’incasso.'),
      values: formValues(formData),
    }
  }

  aggiornaPagine(parsed.data.booking_id)
  return {
    status: 'success',
    message: `Incasso di ${formatEuro(parsed.data.amount ?? 0)} registrato.`,
  }
}

export async function voidPaymentInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')
  const parsed = voidPaymentSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Serve il motivo dello storno.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('void_payment_in', {
    p_payment_id: parsed.data.payment_id,
    p_reason: parsed.data.reason,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a stornare l’incasso.'),
      values: formValues(formData),
    }
  }

  aggiornaPagine(parsed.data.booking_id)
  return { status: 'success', message: 'Incasso stornato.' }
}

// =============================================================================
// Scadenze verso il cliente
// =============================================================================

export async function saveInstallmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const parsed = installmentSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { id, booking_id, amount, ...resto } = parsed.data

  if (id) {
    const { error } = await supabase
      .from('installments')
      .update({ ...resto, amount_cents: amount ?? 0 })
      .eq('id', id)
      .eq('booking_id', booking_id)

    if (error) {
      return {
        status: 'error',
        message: 'Non siamo riusciti a salvare la scadenza.',
        values: formValues(formData),
      }
    }

    aggiornaPagine(booking_id)
    return { status: 'success', message: 'Scadenza aggiornata.' }
  }

  // Una scadenza aggiunta a mano ha comunque bisogno di un piano: se la pratica
  // non è mai stata confermata il piano non esiste ancora e si crea qui.
  const { data: piano, error: erroreLettura } = await supabase
    .from('installment_plans')
    .select('id')
    .eq('booking_id', booking_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (erroreLettura) {
    return { status: 'error', message: 'Non siamo riusciti a leggere il piano rateale.' }
  }

  let planId = piano?.id
  if (!planId) {
    const { data: creato, error: erroreCreazione } = await supabase
      .from('installment_plans')
      .insert({ agency_id: session.agency.id, booking_id, source: 'manuale' })
      .select('id')
      .single()

    if (erroreCreazione || !creato) {
      return { status: 'error', message: 'Non siamo riusciti a creare il piano rateale.' }
    }
    planId = creato.id
  }

  const { error } = await supabase.from('installments').insert({
    ...resto,
    agency_id: session.agency.id,
    booking_id,
    plan_id: planId,
    amount_cents: amount ?? 0,
  })

  if (error) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a salvare la scadenza.',
      values: formValues(formData),
    }
  }

  aggiornaPagine(booking_id)
  return { status: 'success', message: 'Scadenza aggiunta.' }
}

export async function deleteInstallmentAction(
  installmentId: unknown,
  bookingId: unknown,
): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(installmentId) || !isUuid(bookingId)) {
    return { status: 'error', message: 'Scadenza non valida.' }
  }

  const supabase = await createClient()

  // Una scadenza a cui è già stato attribuito un incasso non si toglie: il
  // movimento resterebbe appeso a una riga che non esiste più.
  const { count, error: erroreConteggio } = await supabase
    .from('payments_in')
    .select('id', { count: 'exact', head: true })
    .eq('installment_id', installmentId)
    .is('deleted_at', null)

  if (erroreConteggio) {
    return { status: 'error', message: 'Non siamo riusciti a verificare la scadenza.' }
  }
  if ((count ?? 0) > 0) {
    return {
      status: 'error',
      message: 'Questa scadenza ha già un incasso attribuito: storna prima l’incasso.',
    }
  }

  const { error } = await supabase
    .from('installments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', installmentId)
    .eq('booking_id', bookingId)

  if (error) return { status: 'error', message: 'Non siamo riusciti a togliere la scadenza.' }

  aggiornaPagine(bookingId)
  return { status: 'success', message: 'Scadenza rimossa.' }
}

// =============================================================================
// Pagamenti ai fornitori
// =============================================================================

export async function syncPayoutsAction(bookingId: unknown): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(bookingId)) {
    return { status: 'error', message: 'Pratica non valida.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sync_booking_payouts', { p_booking_id: bookingId })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti ad allineare i pagamenti.'),
    }
  }

  aggiornaPagine(bookingId)
  const toccati = typeof data === 'number' ? data : 0
  return {
    status: 'success',
    message:
      toccati === 0
        ? 'I pagamenti ai fornitori erano già allineati.'
        : `Allineati ${toccati} pagamenti ai fornitori.`,
  }
}

export async function savePayoutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const parsed = payoutSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { id, booking_id, amount, ...resto } = parsed.data
  const payload = { ...resto, booking_id, amount_cents: amount ?? 0 }

  const { error } = id
    ? await supabase.from('payments_out').update(payload).eq('id', id).eq('booking_id', booking_id)
    : await supabase.from('payments_out').insert({ ...payload, agency_id: session.agency.id })

  if (error) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a salvare il pagamento.',
      values: formValues(formData),
    }
  }

  aggiornaPagine(booking_id)
  return { status: 'success', message: id ? 'Pagamento aggiornato.' : 'Pagamento aggiunto.' }
}

export async function setPayoutStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')
  const parsed = payoutStatusSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_payout_status', {
    p_payout_id: parsed.data.payout_id,
    p_status: parsed.data.status,
    p_paid_at: parsed.data.paid_at,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference,
    p_supplier_invoice_number: parsed.data.supplier_invoice_number,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti ad aggiornare il pagamento.'),
      values: formValues(formData),
    }
  }

  revalidatePath('/scadenzario')
  revalidatePath('/pratiche')
  revalidatePath('/')
  return { status: 'success', message: 'Pagamento aggiornato.' }
}

/**
 * Azione di massa dello scadenzario: segna pagati più fornitori in un colpo.
 * Ogni riga passa dalla stessa funzione di dominio della scheda, così il
 * registro attività racconta anche le operazioni fatte in blocco.
 */
export async function markPayoutsAction(ids: unknown, status: unknown): Promise<ActionState> {
  await requirePermission('accounting')

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid)) {
    return { status: 'error', message: 'Nessun pagamento valido selezionato.' }
  }
  if (!isStatoPagamento(status)) {
    return { status: 'error', message: 'Stato del pagamento non valido.' }
  }

  const supabase = await createClient()
  const oggi = new Date().toISOString().slice(0, 10)
  let aggiornati = 0

  for (const id of ids) {
    const { error } = await supabase.rpc('set_payout_status', {
      p_payout_id: id,
      p_status: status,
      p_paid_at: status === 'pagato' ? oggi : null,
    })
    if (!error) aggiornati += 1
  }

  revalidatePath('/scadenzario')
  revalidatePath('/pratiche')
  revalidatePath('/')

  if (aggiornati === 0) {
    return { status: 'error', message: 'Non siamo riusciti ad aggiornare i pagamenti.' }
  }
  return {
    status: 'success',
    message:
      aggiornati === 1 ? 'Pagamento aggiornato.' : `${aggiornati} pagamenti aggiornati.`,
  }
}
