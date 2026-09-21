'use server'

import { revalidatePath } from 'next/cache'
import { type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requireSession } from '@/server/session'
import type { Enums } from '@/lib/database.types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Gli argomenti di una Server Action arrivano dalla rete: si controllano. */
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

const BUCKET = 'documenti'
const MAX_BYTES = 20 * 1024 * 1024

const KINDS: readonly Enums['document_kind'][] = [
  'voucher',
  'contratto',
  'documento_identita',
  'assicurazione',
  'fattura_fornitore',
  'preventivo',
  'fattura',
  'altro',
]

const TIPI_AMMESSI = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/**
 * Nome di file sicuro per lo storage: niente percorsi, niente caratteri che
 * cambiano significato in un URL. Il nome originale resta nel database ed è
 * quello che l'utente rivede.
 */
function safeFileName(name: string): string {
  const pulito = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80)
  return pulito === '' || pulito === '-' ? 'documento' : pulito
}

export async function uploadBookingDocumentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')

  const bookingId = formData.get('booking_id')
  const file = formData.get('file')
  const rawKind = formData.get('kind')
  const notes = formData.get('notes')

  if (!isUuid(bookingId)) {
    return { status: 'error', message: 'Pratica non indicata.' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Scegli un file da caricare.' }
  }
  if (file.size > MAX_BYTES) {
    return { status: 'error', message: 'Il file supera i 20 MB consentiti.' }
  }
  if (!TIPI_AMMESSI.has(file.type)) {
    return {
      status: 'error',
      message: 'Formato non ammesso: sono accettati PDF, immagini e documenti Office.',
    }
  }

  const kind: Enums['document_kind'] =
    typeof rawKind === 'string' && (KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as Enums['document_kind'])
      : 'altro'

  // La prima cartella è l'agenzia: è ciò su cui si regge la policy dello storage.
  const path = `${session.agency.id}/pratiche/${bookingId}/${Date.now()}-${safeFileName(file.name)}`

  const supabase = await createClient()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return { status: 'error', message: `Caricamento non riuscito: ${uploadError.message}` }
  }

  const { error } = await supabase.from('documents').insert({
    agency_id: session.agency.id,
    booking_id: bookingId,
    kind,
    file_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    notes: typeof notes === 'string' && notes.trim() !== '' ? notes.trim() : null,
    created_by: session.user.id,
  })

  if (error) {
    // Il file è già nello storage: senza la riga sarebbe un orfano invisibile.
    await supabase.storage.from(BUCKET).remove([path])
    return { status: 'error', message: 'Non siamo riusciti a registrare il documento.' }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'emissione_documento',
    p_entity_type: 'bookings',
    p_entity_id: bookingId,
    p_entity_label: file.name,
    p_summary: `Documento allegato: ${file.name}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath(`/pratiche/${bookingId}`)
  return { status: 'success', message: 'Documento allegato.' }
}

/**
 * Collegamento temporaneo al file.
 *
 * Il bucket è privato: non esiste un indirizzo pubblico da indovinare. Ogni
 * apertura genera un URL firmato che scade dopo pochi minuti, il tempo di
 * scaricarlo.
 */
export async function signedDocumentUrlAction(
  documentId: string,
): Promise<{ url: string } | { error: string }> {
  const session = await requireSession()
  if (!isUuid(documentId)) return { error: 'Documento non disponibile.' }
  const supabase = await createClient()

  const { data: documento } = await supabase
    .from('documents')
    .select('file_path, agency_id')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!documento || documento.agency_id !== session.agency.id) {
    return { error: 'Documento non disponibile.' }
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(documento.file_path, 300)

  if (error || !data) return { error: 'Non siamo riusciti ad aprire il documento.' }
  return { url: data.signedUrl }
}

export async function deleteDocumentAction(
  documentId: string,
  bookingId: string,
): Promise<ActionState> {
  const session = await requirePermission('write')
  if (!isUuid(documentId) || !isUuid(bookingId)) {
    return { status: 'error', message: 'Documento non valido.' }
  }
  const supabase = await createClient()

  const { data: documento } = await supabase
    .from('documents')
    .select('file_path, file_name')
    .eq('id', documentId)
    .maybeSingle()

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: 'Non siamo riusciti a eliminare il documento.' }

  if (documento?.file_path) {
    await supabase.storage.from(BUCKET).remove([documento.file_path])
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'eliminazione',
    p_entity_type: 'documents',
    p_entity_id: documentId,
    p_entity_label: documento?.file_name ?? null,
    p_summary: `Documento eliminato: ${documento?.file_name ?? 'senza nome'}`,
    p_before: null,
    p_after: null,
  })

  revalidatePath(`/pratiche/${bookingId}`)
  return { status: 'success', message: 'Documento eliminato.' }
}
