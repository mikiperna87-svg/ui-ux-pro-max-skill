import 'server-only'

import { emailConfig } from '@/lib/env'

/**
 * Il fornitore di posta.
 *
 * Una funzione sola, che parla HTTPS con Resend. Sta dietro a un'interfaccia
 * perché il giorno in cui l'agenzia volesse il proprio SMTP si cambia qui
 * dentro e nient'altro: il resto del gestionale conosce solo "accoda e
 * consegna", e l'esito che ne torna.
 */

export interface Allegato {
  readonly filename: string
  /** Contenuto già in base64: è la forma che l'API accetta. */
  readonly content: string
}

export interface MessaggioDaConsegnare {
  readonly to: string
  readonly toName?: string | null
  readonly replyTo?: string | null
  readonly subject: string
  readonly html: string
  readonly text: string
  readonly attachment?: Allegato | null
}

export type EsitoConsegna =
  | { readonly esito: 'consegnato'; readonly provider: string; readonly providerId: string | null }
  | { readonly esito: 'non_configurato' }
  | { readonly esito: 'errore'; readonly messaggio: string }

const ENDPOINT = 'https://api.resend.com/emails'
const ATTESA_MASSIMA_MS = 15_000

/** Destinatario nella forma "Nome <indirizzo>", che i client mostrano per esteso. */
function destinatario(messaggio: MessaggioDaConsegnare): string {
  const nome = messaggio.toName?.trim()
  // Le virgolette servono quando il nome contiene una virgola: senza, il
  // messaggio verrebbe letto come due destinatari diversi.
  return nome ? `"${nome.replace(/"/g, '')}" <${messaggio.to}>` : messaggio.to
}

export function postaConfigurata(): boolean {
  return emailConfig() !== null
}

export async function consegna(messaggio: MessaggioDaConsegnare): Promise<EsitoConsegna> {
  const config = emailConfig()
  if (!config) return { esito: 'non_configurato' }

  try {
    const risposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: [destinatario(messaggio)],
        subject: messaggio.subject,
        html: messaggio.html,
        text: messaggio.text,
        ...(messaggio.replyTo ? { reply_to: messaggio.replyTo } : {}),
        ...(messaggio.attachment
          ? { attachments: [{ filename: messaggio.attachment.filename, content: messaggio.attachment.content }] }
          : {}),
      }),
      // Un fornitore che non risponde non deve tenere fermo l'operatore: dopo
      // quindici secondi il messaggio resta in coda e si rimanda.
      signal: AbortSignal.timeout(ATTESA_MASSIMA_MS),
      cache: 'no-store',
    })

    if (!risposta.ok) {
      const corpo = await risposta.text().catch(() => '')
      return { esito: 'errore', messaggio: descriviErrore(risposta.status, corpo) }
    }

    const dati = (await risposta.json().catch(() => null)) as { id?: string } | null
    return { esito: 'consegnato', provider: 'resend', providerId: dati?.id ?? null }
  } catch (errore) {
    if (errore instanceof Error && errore.name === 'TimeoutError') {
      return { esito: 'errore', messaggio: 'Il fornitore di posta non ha risposto entro 15 secondi.' }
    }
    return {
      esito: 'errore',
      messaggio: errore instanceof Error ? errore.message : 'Errore sconosciuto nell’invio.',
    }
  }
}

/**
 * Traduce l'errore del fornitore in una frase che dice che cosa fare.
 *
 * "422 Unprocessable Entity" non aiuta nessuno; "il dominio del mittente non è
 * verificato" dice dove intervenire.
 */
function descriviErrore(stato: number, corpo: string): string {
  const dettaglio = estraiMessaggio(corpo)

  if (stato === 401 || stato === 403) {
    return `Il fornitore di posta ha rifiutato la chiave (${stato}). Controlla RESEND_API_KEY.${dettaglio}`
  }
  if (stato === 422) {
    return `Messaggio rifiutato (422): di solito il dominio del mittente non è verificato.${dettaglio}`
  }
  if (stato === 429) {
    return 'Troppi messaggi in poco tempo (429): riprova fra qualche minuto.'
  }
  if (stato >= 500) {
    return `Il fornitore di posta ha avuto un problema (${stato}): il messaggio resta in coda.${dettaglio}`
  }
  return `Invio rifiutato (${stato}).${dettaglio}`
}

function estraiMessaggio(corpo: string): string {
  if (!corpo) return ''
  try {
    const dati = JSON.parse(corpo) as { message?: string; error?: string }
    const testo = dati.message ?? dati.error
    return testo ? ` ${testo}` : ''
  } catch {
    return ` ${corpo.slice(0, 200)}`
  }
}
