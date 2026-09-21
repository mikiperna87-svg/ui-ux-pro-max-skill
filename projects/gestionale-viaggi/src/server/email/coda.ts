import 'server-only'

import type { Enums, Tables } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { consegna, postaConfigurata, type Allegato } from '@/server/email/fornitore'
import { pdfFattura } from '@/server/pdf/fattura'
import { requireSession } from '@/server/session'

/**
 * La coda della posta in uscita.
 *
 * Ogni messaggio viene prima scritto sul database e poi consegnato: se il
 * fornitore non risponde, o non è ancora configurato, la riga resta lì con il
 * suo stato e si rimanda quando si può. È l'opposto di un invio "al volo", in
 * cui un errore di rete fa sparire il messaggio e nessuno sa più se il cliente
 * l'abbia ricevuto.
 *
 * Nulla parte senza lasciare traccia, e nulla risulta inviato senza esserlo:
 * il vincolo che lega lo stato "inviata" alla data di invio sta sul database,
 * non nelle intenzioni di questo file.
 */

export interface RichiestaEmail {
  readonly kind: Enums['email_kind']
  readonly to: string
  readonly toName?: string | null
  readonly subject: string
  readonly html: string
  readonly text: string
  readonly attachment?: Allegato | null
  readonly quoteId?: string | null
  readonly invoiceId?: string | null
  readonly bookingId?: string | null
  readonly customerId?: string | null
}

export interface EsitoEmail {
  readonly stato: Enums['email_status']
  readonly messageId: string | null
  /** Frase pronta per l'operatore: dice che cosa è successo e che cosa aspettarsi. */
  readonly messaggio: string
}

export class EmailError extends Error {}

const FRASI = {
  inviata: 'Messaggio inviato.',
  in_coda:
    'Nessun fornitore di posta configurato: il messaggio resta in coda e si invia da Impostazioni → Email.',
  annullata: 'Le notifiche email sono disattivate nelle impostazioni dell’agenzia.',
} as const

/** Un indirizzo plausibile: il controllo vero lo fa il vincolo sul database. */
export function indirizzoValido(valore: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valore.trim())
}

export async function accodaEInvia(richiesta: RichiestaEmail): Promise<EsitoEmail> {
  const session = await requireSession()
  const supabase = await createClient()

  if (!indirizzoValido(richiesta.to)) {
    throw new EmailError('L’indirizzo del destinatario non è valido.')
  }

  const { data: riga, error } = await supabase
    .from('email_messages')
    .insert({
      agency_id: session.agency.id,
      kind: richiesta.kind,
      status: 'in_coda',
      to_email: richiesta.to.trim(),
      to_name: richiesta.toName ?? null,
      reply_to: session.settings.email_reply_to ?? session.agency.email ?? null,
      subject: richiesta.subject,
      body_text: richiesta.text,
      body_html: richiesta.html,
      attachment_name: richiesta.attachment?.filename ?? null,
      quote_id: richiesta.quoteId ?? null,
      invoice_id: richiesta.invoiceId ?? null,
      booking_id: richiesta.bookingId ?? null,
      customer_id: richiesta.customerId ?? null,
      created_by: session.membership.id,
    })
    .select('*')
    .single()

  if (error || !riga) {
    throw new EmailError(`Non siamo riusciti a mettere il messaggio in coda: ${error?.message ?? ''}`)
  }

  // L'interruttore dell'agenzia si rispetta dopo aver scritto la riga: così
  // resta scritto che cosa sarebbe partito, e perché non è partito.
  if (!session.settings.email_enabled) {
    await segna(riga.id, {
      status: 'annullata',
      error_message: 'Invio disattivato nelle impostazioni dell’agenzia.',
    })
    return { stato: 'annullata', messageId: riga.id, messaggio: FRASI.annullata }
  }

  return consegnaRiga(riga, richiesta.attachment ?? null)
}

/**
 * Riprova un messaggio rimasto in coda o finito in errore.
 *
 * L'allegato non si conserva sul database — un PDF per riga sarebbe un
 * archivio che cresce senza motivo — ma si ricostruisce: il documento è
 * sempre quello, perché una fattura emessa non cambia più.
 */
export async function rinvia(messageId: string): Promise<EsitoEmail> {
  const session = await requireSession()
  const supabase = await createClient()

  const { data: riga } = await supabase
    .from('email_messages')
    .select('*')
    .eq('id', messageId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!riga) throw new EmailError('Messaggio non trovato.')
  if (riga.status === 'inviata') {
    return { stato: 'inviata', messageId: riga.id, messaggio: 'Il messaggio era già stato inviato.' }
  }
  if (!session.settings.email_enabled) {
    return { stato: 'annullata', messageId: riga.id, messaggio: FRASI.annullata }
  }

  let allegato: Allegato | null = null
  if (riga.attachment_name && riga.invoice_id) {
    const esito = await pdfFattura(riga.invoice_id)
    if (esito.esito === 'ok') {
      allegato = {
        filename: esito.pdf.filename,
        content: esito.pdf.buffer.toString('base64'),
      }
    }
  }

  return consegnaRiga(riga, allegato)
}

/** Annulla un messaggio che non deve più partire. */
export async function annulla(messageId: string): Promise<void> {
  await requireSession()
  await segna(messageId, {
    status: 'annullata',
    error_message: 'Annullato dall’operatore.',
  })
}

async function consegnaRiga(
  riga: Tables<'email_messages'>,
  allegato: Allegato | null,
): Promise<EsitoEmail> {
  if (!postaConfigurata()) {
    return { stato: 'in_coda', messageId: riga.id, messaggio: FRASI.in_coda }
  }

  const esito = await consegna({
    to: riga.to_email,
    toName: riga.to_name,
    replyTo: riga.reply_to,
    subject: riga.subject,
    html: riga.body_html,
    text: riga.body_text,
    attachment: allegato,
  })

  if (esito.esito === 'non_configurato') {
    return { stato: 'in_coda', messageId: riga.id, messaggio: FRASI.in_coda }
  }

  if (esito.esito === 'errore') {
    await segna(riga.id, {
      status: 'errore',
      error_message: esito.messaggio,
      attempts: riga.attempts + 1,
      last_attempt_at: new Date().toISOString(),
    })
    return {
      stato: 'errore',
      messageId: riga.id,
      messaggio: `Invio non riuscito: ${esito.messaggio}`,
    }
  }

  await segna(riga.id, {
    status: 'inviata',
    sent_at: new Date().toISOString(),
    provider: esito.provider,
    provider_message_id: esito.providerId,
    error_message: null,
    attempts: riga.attempts + 1,
    last_attempt_at: new Date().toISOString(),
  })

  return { stato: 'inviata', messageId: riga.id, messaggio: FRASI.inviata }
}

async function segna(
  id: string,
  campi: Partial<Tables<'email_messages'>>,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('email_messages').update(campi).eq('id', id)
  // Un aggiornamento fallito qui lascerebbe il messaggio "in coda" quando è
  // già partito: meglio saperlo subito che scoprirlo da un doppio invio.
  if (error) throw new EmailError(`Esito dell’invio non registrato: ${error.message}`)
}
