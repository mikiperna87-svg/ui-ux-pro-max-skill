'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { preparaSdi } from '@/server/sdi/fattura'
import { requirePermission } from '@/server/session'

/**
 * Le due azioni della fattura elettronica.
 *
 * «Prepara» assegna il progressivo di invio e blocca il nome del file: da quel
 * momento il documento ha un'identità presso SdI, e riscaricarlo produce lo
 * stesso file. «Registra esito» annota che cosa ha risposto l'intermediario,
 * perché la risposta arriva per email o dal suo portale — non da qui.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function aggiorna(invoiceId: string) {
  revalidatePath('/fatture')
  revalidatePath(`/fatture/${invoiceId}`)
}

export async function preparaXmlAction(invoiceId: unknown): Promise<ActionState> {
  await requirePermission('accounting')
  if (!isUuid(invoiceId)) return { status: 'error', message: 'Documento non valido.' }

  const montato = await preparaSdi(invoiceId)

  if (montato.esito === 'non_trovato') {
    return { status: 'error', message: 'Documento non trovato.' }
  }
  if (montato.esito === 'bozza') {
    return {
      status: 'error',
      message: 'La bozza non ha un numero: emetti il documento prima di preparare il file.',
    }
  }
  if (montato.esito === 'dati_mancanti') {
    return { status: 'error', message: 'Dati dell’agenzia o del cliente non disponibili.' }
  }
  if (montato.esito === 'non_valida') {
    const primo = montato.verifica.bloccanti[0]
    return {
      status: 'error',
      message: primo
        ? `${primo.messaggio} (${primo.dove})`
        : 'Il documento non è pronto per la trasmissione.',
    }
  }

  const supabase = await createClient()

  // Il progressivo si assegna una volta sola: se c'è già, si riusa. Due file
  // con lo stesso nome dallo stesso trasmittente vengono rifiutati da SdI.
  const { data: attuale } = await supabase
    .from('invoices')
    .select('sdi_progressivo, sdi_filename')
    .eq('id', invoiceId)
    .maybeSingle()

  let progressivo = attuale?.sdi_progressivo ?? null

  if (!progressivo) {
    const { data, error } = await supabase.rpc('next_sdi_progressivo', {
      p_agency_id: montato.agencyId,
    })
    if (error || !data) {
      return { status: 'error', message: 'Non siamo riusciti ad assegnare il progressivo di invio.' }
    }
    progressivo = String(data)
  }

  const filename = montato.nome(progressivo)

  const { error } = await supabase
    .from('invoices')
    .update({
      sdi_progressivo: progressivo,
      sdi_filename: filename,
      // Se era già stata inviata, preparare di nuovo non la riporta indietro:
      // lo stato avanza, non torna.
      sdi_status: attuale?.sdi_progressivo ? undefined : 'generata',
    })
    .eq('id', invoiceId)

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a preparare il file.' }
  }

  aggiorna(invoiceId)
  return { status: 'success', message: `File pronto: ${filename}` }
}

const esitoSchema = z.object({
  id: z.string().regex(UUID, 'Documento non valido'),
  stato: z.enum(['inviata', 'consegnata', 'mancata_consegna', 'scartata']),
  messaggio: z.string().trim().max(500).optional(),
})

const FRASI: Record<string, string> = {
  inviata: 'Documento segnato come inviato all’intermediario.',
  consegnata: 'Documento segnato come consegnato dal Sistema di Interscambio.',
  mancata_consegna:
    'Documento segnato come non consegnato: resta valido e disponibile nel cassetto fiscale del cliente.',
  scartata: 'Documento segnato come scartato: va corretto e ritrasmesso.',
}

export async function registraEsitoSdiAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('accounting')

  const parsed = esitoSchema.safeParse({
    id: formData.get('id'),
    stato: formData.get('stato'),
    messaggio: formData.get('messaggio') ?? undefined,
  })

  if (!parsed.success) {
    return { status: 'error', message: 'Controlla i dati inseriti.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({
      sdi_status: parsed.data.stato,
      sdi_message: parsed.data.messaggio?.trim() || null,
      sdi_sent_at: parsed.data.stato === 'inviata' ? new Date().toISOString() : undefined,
    })
    .eq('id', parsed.data.id)

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a registrare l’esito.' }
  }

  aggiorna(parsed.data.id)
  return { status: 'success', message: FRASI[parsed.data.stato] ?? 'Esito registrato.' }
}
