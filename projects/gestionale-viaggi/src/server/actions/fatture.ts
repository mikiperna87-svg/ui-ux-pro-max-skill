'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import {
  creditNoteSchema,
  invoiceItemSchema,
  invoiceSchema,
  issueInvoiceSchema,
} from '@/lib/validation/fatture'
import { requirePermission } from '@/server/session'

/**
 * Le operazioni di questo modulo toccano documenti fiscali: una fattura emessa
 * non si modifica e la numerazione non ammette buchi. I controlli veri sono nel
 * database — qui si validano gli ingressi e si traducono gli errori in frasi
 * che un amministrativo possa leggere.
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

function rpcMessage(error: { message: string }, fallback: string): string {
  const pulito = error.message.replace(/^.*?:\s*/, '').trim()
  return pulito.length > 0 && pulito.length < 250 ? pulito : fallback
}

function aggiornaPagine(invoiceId?: string, bookingId?: string | null) {
  revalidatePath('/fatture')
  revalidatePath('/registri')
  if (invoiceId) revalidatePath(`/fatture/${invoiceId}`)
  if (bookingId) revalidatePath(`/pratiche/${bookingId}`)
  revalidatePath('/')
}

// =============================================================================
// Testata
// =============================================================================

export async function saveInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const id = formData.get('id')
  const parsed = invoiceSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()

  if (isUuid(id)) {
    const { error } = await supabase
      .from('invoices')
      .update(parsed.data)
      .eq('id', id)
      .eq('status', 'bozza')

    if (error) {
      return {
        status: 'error',
        message: rpcMessage(error, 'Non siamo riusciti a salvare il documento.'),
        values: formValues(formData),
      }
    }
    aggiornaPagine(id, parsed.data.booking_id)
    redirect(`/fatture/${id}`)
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...parsed.data,
      agency_id: session.agency.id,
      kind: 'fattura',
      status: 'bozza',
      created_by: session.user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      status: 'error',
      message: rpcMessage(
        error ?? { message: '' },
        'Non siamo riusciti a creare il documento.',
      ),
      values: formValues(formData),
    }
  }

  aggiornaPagine(data.id, parsed.data.booking_id)
  redirect(`/fatture/${data.id}`)
}

/** Apre una bozza di fattura dalle righe di una pratica. */
export async function invoiceFromBookingAction(
  bookingId: unknown,
  mode: unknown,
): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(bookingId)) return { status: 'error', message: 'Pratica non valida.' }
  if (mode !== undefined && mode !== null && mode !== 'servizi' && mode !== 'commissione') {
    return { status: 'error', message: 'Modalità di fatturazione non prevista.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('invoice_from_booking', {
    p_booking_id: bookingId,
    p_mode: (mode ?? null) as 'servizi' | 'commissione' | null,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti ad aprire la fattura.'),
    }
  }

  const fattura = Array.isArray(data) ? data[0] : data
  const invoiceId =
    fattura && typeof fattura === 'object' && 'id' in fattura ? String(fattura.id) : ''

  aggiornaPagine(invoiceId, bookingId)
  return {
    status: 'success',
    message: 'Bozza di fattura aperta dalla pratica.',
    values: { id: invoiceId },
  }
}

export async function issueInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')
  const parsed = issueInvoiceSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla la data di emissione.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('issue_invoice', {
    p_invoice_id: parsed.data.id,
    p_issue_date: parsed.data.issue_date,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a emettere il documento.'),
      values: formValues(formData),
    }
  }

  const emessa = Array.isArray(data) ? data[0] : data
  const codice =
    emessa && typeof emessa === 'object' && 'code' in emessa ? String(emessa.code) : ''

  aggiornaPagine(parsed.data.id)
  return {
    status: 'success',
    message: codice === '' ? 'Documento emesso.' : `Documento ${codice} emesso.`,
  }
}

export async function sendInvoiceAction(invoiceId: unknown): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(invoiceId)) return { status: 'error', message: 'Documento non valido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('send_invoice', { p_invoice_id: invoiceId })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a segnare l’invio.'),
    }
  }

  aggiornaPagine(invoiceId)
  return { status: 'success', message: 'Documento segnato come inviato.' }
}

export async function creditNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')
  const parsed = creditNoteSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('credit_note_for', {
    p_invoice_id: parsed.data.invoice_id,
    p_reason: parsed.data.reason,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti ad aprire la nota di credito.'),
      values: formValues(formData),
    }
  }

  const nota = Array.isArray(data) ? data[0] : data
  const notaId = nota && typeof nota === 'object' && 'id' in nota ? String(nota.id) : ''

  aggiornaPagine(parsed.data.invoice_id)
  if (notaId) revalidatePath(`/fatture/${notaId}`)

  return {
    status: 'success',
    message: 'Bozza di nota di credito creata: controllala e poi emettila.',
    values: { id: notaId },
  }
}

export async function deleteDraftInvoiceAction(invoiceId: unknown): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(invoiceId)) return { status: 'error', message: 'Documento non valido.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('void_draft_invoice', { p_invoice_id: invoiceId })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a eliminare la bozza.'),
    }
  }

  aggiornaPagine()
  return { status: 'success', message: 'Bozza eliminata.' }
}

// =============================================================================
// Righe
// =============================================================================

export async function saveInvoiceItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const id = formData.get('id')
  const parsed = invoiceItemSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { invoice_id, unit_price, cost, vat_percent, ...resto } = parsed.data

  const payload = {
    ...resto,
    invoice_id,
    unit_price_cents: unit_price ?? 0,
    cost_cents: cost ?? 0,
    vat_bps: vat_percent,
  }

  const { error } = isUuid(id)
    ? await supabase
        .from('invoice_items')
        .update(payload)
        .eq('id', id)
        .eq('invoice_id', invoice_id)
    : await supabase
        .from('invoice_items')
        .insert({ ...payload, agency_id: session.agency.id, created_by: session.user.id })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a salvare la riga.'),
      values: formValues(formData),
    }
  }

  aggiornaPagine(invoice_id)
  return { status: 'success', message: isUuid(id) ? 'Riga aggiornata.' : 'Riga aggiunta.' }
}

export async function deleteInvoiceItemAction(
  itemId: unknown,
  invoiceId: unknown,
): Promise<ActionState> {
  await requirePermission('accounting')

  if (!isUuid(itemId) || !isUuid(invoiceId)) {
    return { status: 'error', message: 'Riga non valida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invoice_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('invoice_id', invoiceId)

  if (error) {
    return { status: 'error', message: rpcMessage(error, 'Non siamo riusciti a togliere la riga.') }
  }

  aggiornaPagine(invoiceId)
  return { status: 'success', message: 'Riga rimossa.' }
}
