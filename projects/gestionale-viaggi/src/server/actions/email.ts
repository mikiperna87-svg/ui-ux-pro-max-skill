'use server'

import { revalidatePath } from 'next/cache'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { siteUrl } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import {
  impostazioniEmailSchema,
  invioFatturaSchema,
  invioPreventivoSchema,
  promemoriaSchema,
  provaEmailSchema,
} from '@/lib/validation/email'
import { accodaEInvia, annulla, rinvia, EmailError } from '@/server/email/coda'
import {
  messaggioFattura,
  messaggioPreventivo,
  messaggioPromemoria,
  messaggioProva,
} from '@/server/email/modelli'
import { pdfFattura } from '@/server/pdf/fattura'
import { requirePermission } from '@/server/session'

/**
 * L'invio delle email.
 *
 * Ogni azione compone il messaggio dai dati veri, lo mette in coda e riferisce
 * che cosa è successo senza abbellirlo: "inviato" solo se è partito davvero,
 * "in coda" quando manca il fornitore di posta, l'errore per esteso quando il
 * fornitore rifiuta. Il registro dei messaggi resta come prova in Impostazioni
 * → Email.
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

/**
 * L'esito della coda diventa lo stato dell'azione.
 *
 * "In coda" è un successo: il messaggio è stato accettato e partirà: il testo
 * dice che non è ancora partito, ma il modulo si chiude perché non c'è niente
 * da correggere. "Errore" e "annullata" restano errori — il primo si può
 * riprovare, il secondo dipende da un'impostazione — e lasciano il modulo
 * aperto su ciò che è andato storto.
 */
function esitoAzione(
  stato: 'inviata' | 'in_coda' | 'errore' | 'annullata',
  messaggio: string,
  extra?: Record<string, string>,
): ActionState {
  return {
    status: stato === 'inviata' || stato === 'in_coda' ? 'success' : 'error',
    message: messaggio,
    values: extra,
  }
}

function erroreEmail(errore: unknown, ripiego: string): ActionState {
  if (errore instanceof EmailError) return { status: 'error', message: errore.message }
  return { status: 'error', message: ripiego }
}

// --- Preventivo ----------------------------------------------------------------
export async function inviaPreventivoEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const parsed = invioPreventivoSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data: quote } = await supabase
    .from('quote_list')
    .select('*')
    .eq('id', parsed.data.quote_id)
    .maybeSingle()

  if (!quote) return { status: 'error', message: 'Preventivo non trovato.' }
  if ((quote.items_count ?? 0) === 0) {
    return {
      status: 'error',
      message: 'Prima di inviare, aggiungi almeno una riga a una delle proposte.',
      values: formValues(formData),
    }
  }

  const messaggio = messaggioPreventivo({
    mittente: { agency: session.agency, firma: session.settings.email_signature },
    destinatarioNome: quote.customer_name ?? 'cliente',
    quote: {
      code: quote.code ?? '',
      title: quote.title ?? '',
      destination: quote.destination ?? '',
      departure_date: quote.departure_date,
      pax_count: quote.pax_count ?? 1,
      valid_until: quote.valid_until,
    },
    link: `${siteUrl()}/preventivo/${quote.public_token}`,
    testoLibero: parsed.data.message,
  })

  let esito
  try {
    esito = await accodaEInvia({
      kind: 'preventivo',
      to: parsed.data.to,
      toName: quote.customer_name,
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
      quoteId: quote.id ?? null,
      customerId: quote.customer_id,
    })
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti a preparare il messaggio.')
  }

  // Il preventivo si segna come inviato anche quando l'email resta in coda: da
  // questo momento il collegamento pubblico è attivo, la validità decorre e
  // l'offerta può essere accettata — anche se l'operatore la manda per un
  // altro canale. Lo stato del messaggio è un'informazione a parte, e si
  // legge nel registro della posta.
  if (quote.status === 'bozza' || quote.status === 'inviato') {
    await supabase
      .from('quotes')
      .update({ status: 'inviato', sent_at: new Date().toISOString() })
      .eq('id', parsed.data.quote_id)
      .in('status', ['bozza', 'inviato'])

    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'cambio_stato',
      p_entity_type: 'quotes',
      p_entity_id: parsed.data.quote_id,
      p_entity_label: quote.code ?? '',
      p_summary: `Preventivo inviato a ${parsed.data.to}`,
    })
  }

  revalidatePath('/preventivi')
  revalidatePath(`/preventivi/${parsed.data.quote_id}`)
  revalidatePath('/impostazioni')

  return esitoAzione(
    esito.stato,
    esito.stato === 'inviata'
      ? `Preventivo inviato a ${parsed.data.to}.`
      : `Il preventivo è ora accettabile dal collegamento pubblico. ${esito.messaggio}`,
  )
}

// --- Fattura -------------------------------------------------------------------
export async function inviaFatturaEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const parsed = invioFatturaSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data: invoice } = await supabase
    .from('invoice_list')
    .select('*')
    .eq('id', parsed.data.invoice_id)
    .maybeSingle()

  if (!invoice) return { status: 'error', message: 'Documento non trovato.' }
  if (invoice.status === 'bozza') {
    return {
      status: 'error',
      message: 'Una bozza non si invia: emetti il documento, così prende il numero.',
    }
  }

  let allegato = null
  if (parsed.data.allega_pdf) {
    const pdf = await pdfFattura(parsed.data.invoice_id)
    if (pdf.esito !== 'ok') {
      return {
        status: 'error',
        message: 'Non siamo riusciti a generare il PDF del documento: riprova fra un istante.',
      }
    }
    allegato = { filename: pdf.pdf.filename, content: pdf.pdf.buffer.toString('base64') }
  }

  const messaggio = messaggioFattura({
    mittente: { agency: session.agency, firma: session.settings.email_signature },
    destinatarioNome: invoice.customer_name ?? 'cliente',
    invoice: {
      code: invoice.code ?? '',
      kind: invoice.kind === 'nota_credito' ? 'nota_credito' : 'fattura',
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      total_cents: Number(invoice.total_cents ?? 0),
    },
    bookingCode: invoice.booking_code,
    allegato: allegato !== null,
  })

  let esito
  try {
    esito = await accodaEInvia({
      kind: 'fattura',
      to: parsed.data.to,
      toName: invoice.customer_name,
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
      attachment: allegato,
      invoiceId: invoice.id ?? null,
      bookingId: invoice.booking_id,
      customerId: invoice.customer_id,
    })
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti a preparare il messaggio.')
  }

  // "Inviata" sul documento vuol dire che il cliente l'ha ricevuta: si scrive
  // solo se il messaggio è partito davvero.
  if (esito.stato === 'inviata' && invoice.status === 'emessa') {
    await supabase.rpc('send_invoice', { p_invoice_id: parsed.data.invoice_id })
  }

  revalidatePath('/fatture')
  revalidatePath(`/fatture/${parsed.data.invoice_id}`)
  revalidatePath('/impostazioni')

  return esitoAzione(
    esito.stato,
    esito.stato === 'inviata'
      ? `Documento inviato a ${parsed.data.to}.`
      : `Il documento non risulta inviato al cliente. ${esito.messaggio}`,
  )
}

// --- Promemoria di pagamento -----------------------------------------------------
export async function inviaPromemoriaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const parsed = promemoriaSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data: rata } = await supabase
    .from('installment_list')
    .select('*')
    .eq('id', parsed.data.installment_id)
    .maybeSingle()

  if (!rata || rata.booking_id !== parsed.data.booking_id) {
    return { status: 'error', message: 'Scadenza non trovata.' }
  }

  const messaggio = messaggioPromemoria({
    mittente: { agency: session.agency, firma: session.settings.email_signature },
    destinatarioNome: rata.customer_name ?? 'cliente',
    booking: {
      code: rata.booking_code ?? '',
      title: rata.booking_title ?? '',
      destination: rata.destination ?? '',
      departure_date: rata.departure_date,
    },
    importoCents: Number(rata.residual_cents ?? rata.amount_cents ?? 0),
    scadenza: String(rata.due_date),
    testoLibero: parsed.data.message,
  })

  let esito
  try {
    esito = await accodaEInvia({
      kind: 'promemoria_incasso',
      to: parsed.data.to,
      toName: rata.customer_name,
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
      bookingId: rata.booking_id,
      customerId: rata.customer_id,
    })
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti a preparare il messaggio.')
  }

  if (esito.stato === 'inviata') {
    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'modifica',
      p_entity_type: 'bookings',
      p_entity_id: parsed.data.booking_id,
      p_entity_label: rata.booking_code ?? '',
      p_summary: `Promemoria di pagamento inviato a ${parsed.data.to}`,
    })
  }

  revalidatePath(`/pratiche/${parsed.data.booking_id}`)
  revalidatePath('/scadenzario')
  revalidatePath('/impostazioni')

  return esitoAzione(
    esito.stato,
    esito.stato === 'inviata'
      ? `Promemoria inviato a ${parsed.data.to}.`
      : `Il promemoria non è ancora partito. ${esito.messaggio}`,
  )
}

// --- Prova e gestione della coda ---------------------------------------------------
export async function provaEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('settings')
  const parsed = provaEmailSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla l’indirizzo.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const messaggio = messaggioProva({
    mittente: { agency: session.agency, firma: session.settings.email_signature },
    destinatario: parsed.data.to,
  })

  let esito
  try {
    esito = await accodaEInvia({
      kind: 'prova',
      to: parsed.data.to,
      toName: session.membership.full_name,
      subject: messaggio.subject,
      html: messaggio.html,
      text: messaggio.text,
    })
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti a preparare il messaggio di prova.')
  }

  revalidatePath('/impostazioni')

  return esitoAzione(
    esito.stato,
    esito.stato === 'inviata'
      ? `Messaggio di prova inviato a ${parsed.data.to}: controlla la casella.`
      : esito.messaggio,
  )
}

export async function rinviaEmailAction(messageId: unknown): Promise<ActionState> {
  await requirePermission('write')
  if (!isUuid(messageId)) return { status: 'error', message: 'Messaggio non valido.' }

  let esito
  try {
    esito = await rinvia(messageId)
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti a rimandare il messaggio.')
  }

  revalidatePath('/impostazioni')
  return esitoAzione(esito.stato, esito.messaggio)
}

export async function annullaEmailAction(messageId: unknown): Promise<ActionState> {
  await requirePermission('write')
  if (!isUuid(messageId)) return { status: 'error', message: 'Messaggio non valido.' }

  try {
    await annulla(messageId)
  } catch (errore) {
    return erroreEmail(errore, 'Non siamo riusciti ad annullare il messaggio.')
  }

  revalidatePath('/impostazioni')
  return { status: 'success', message: 'Messaggio annullato: non partirà.' }
}

export async function salvaImpostazioniEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('settings')
  const parsed = impostazioniEmailSchema.safeParse(formObject(formData))

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
    .from('agency_settings')
    .update({
      email_enabled: parsed.data.email_enabled,
      email_from_name: parsed.data.email_from_name,
      email_reply_to: parsed.data.email_reply_to,
      email_signature: parsed.data.email_signature,
    })
    .eq('agency_id', session.agency.id)

  if (error) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a salvare le impostazioni.',
      values: formValues(formData),
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'modifica',
    p_entity_type: 'agency_settings',
    p_entity_id: session.agency.id,
    p_entity_label: session.agency.name,
    p_summary: parsed.data.email_enabled
      ? 'Impostazioni della posta aggiornate'
      : 'Invio delle email disattivato',
  })

  revalidatePath('/impostazioni')
  return { status: 'success', message: 'Impostazioni della posta salvate.' }
}
