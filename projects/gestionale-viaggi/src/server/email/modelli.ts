import 'server-only'

import { formatDateLong, formatDateShort } from '@/lib/date'
import { formatEuro } from '@/lib/money'
import type { Tables } from '@/lib/database.types'

/**
 * I modelli dei messaggi.
 *
 * Un'email non è una pagina web: niente fogli di stile esterni, niente
 * flexbox, larghezza fissa e stili scritti sull'elemento. Il risultato deve
 * restare leggibile anche dove l'HTML viene buttato via, quindi ogni
 * messaggio nasce in due versioni — HTML e testo semplice — con le stesse
 * informazioni. Non è una copia di cortesia: è la versione che leggono i
 * filtri antispam, gli orologi e chi tiene le immagini spente.
 *
 * I colori sono quelli del gestionale, scritti in esadecimale perché in posta
 * le variabili CSS non esistono.
 */

const ACCENTO = '#006965'
const ACCENTO_SCURO = '#073e3e'
const ACCENTO_CHIARO = '#e9faf9'
const TESTO = '#1c1814'
const TESTO_TENUE = '#5f5a55'
const LINEA = '#d9d5cd'
const SFONDO = '#f5f4f1'

export interface Messaggio {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export interface MittenteAgenzia {
  readonly agency: Tables<'agencies'>
  readonly firma?: string | null
}

/** Riga del riquadro dei dettagli: etichetta a sinistra, valore a destra. */
interface Dettaglio {
  readonly label: string
  readonly value: string
}

interface Impaginazione {
  readonly titolo: string
  readonly occhiello?: string
  readonly paragrafi: readonly string[]
  readonly dettagli?: readonly Dettaglio[]
  readonly azione?: { readonly label: string; readonly href: string } | null
  readonly chiusura?: string
  readonly mittente: MittenteAgenzia
}

/** Il testo entra nell'HTML: va sempre neutralizzato, anche quando arriva da noi. */
function esc(valore: string): string {
  return valore
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function contattiAgenzia(agency: Tables<'agencies'>): string[] {
  const indirizzo = [agency.address_line, [agency.postal_code, agency.city].filter(Boolean).join(' '), agency.province]
    .filter((pezzo) => pezzo && String(pezzo).trim() !== '')
    .join(' · ')

  return [indirizzo, agency.phone, agency.email, agency.website]
    .filter((pezzo): pezzo is string => typeof pezzo === 'string' && pezzo.trim() !== '')
}

function impagina(dati: Impaginazione): { html: string; text: string } {
  const { agency } = dati.mittente
  const contatti = contattiAgenzia(agency)
  const firma = dati.mittente.firma?.trim()

  const righeDettaglio = (dati.dettagli ?? [])
    .map(
      (riga) => `
              <tr>
                <td style="padding:6px 0;color:${TESTO_TENUE};font-size:14px;">${esc(riga.label)}</td>
                <td style="padding:6px 0;color:${TESTO};font-size:14px;font-weight:600;text-align:right;">${esc(riga.value)}</td>
              </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(dati.titolo)}</title>
  </head>
  <body style="margin:0;padding:0;background:${SFONDO};">
    <!-- Anteprima: la prima riga che molti client mostrano accanto all'oggetto. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(dati.paragrafi[0] ?? dati.titolo)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SFONDO};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINEA};border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="background:${ACCENTO};padding:20px 28px;">
                <p style="margin:0;color:#ffffff;font-size:17px;font-weight:600;letter-spacing:0.2px;">${esc(agency.name)}</p>
                ${dati.occhiello ? `<p style="margin:4px 0 0;color:${ACCENTO_CHIARO};font-size:13px;">${esc(dati.occhiello)}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;color:${TESTO};font-size:21px;line-height:1.3;font-weight:600;">${esc(dati.titolo)}</h1>
                ${dati.paragrafi
                  .map(
                    (paragrafo) =>
                      `<p style="margin:0 0 14px;color:${TESTO};font-size:15px;line-height:1.6;">${esc(paragrafo)}</p>`,
                  )
                  .join('')}
                ${
                  righeDettaglio
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:${ACCENTO_CHIARO};border-radius:8px;padding:6px 16px;">${righeDettaglio}</table>`
                    : ''
                }
                ${
                  dati.azione
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
                <tr>
                  <td style="background:${ACCENTO};border-radius:8px;">
                    <a href="${esc(dati.azione.href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${esc(dati.azione.label)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 14px;color:${TESTO_TENUE};font-size:13px;line-height:1.6;word-break:break-all;">Se il pulsante non funziona, copia questo indirizzo nel browser:<br />${esc(dati.azione.href)}</p>`
                    : ''
                }
                ${dati.chiusura ? `<p style="margin:18px 0 0;color:${TESTO};font-size:15px;line-height:1.6;">${esc(dati.chiusura)}</p>` : ''}
                ${
                  firma
                    ? `<p style="margin:18px 0 0;color:${TESTO};font-size:15px;line-height:1.6;white-space:pre-line;">${esc(firma)}</p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid ${LINEA};padding:18px 28px;background:#ffffff;">
                <p style="margin:0;color:${ACCENTO_SCURO};font-size:13px;font-weight:600;">${esc(agency.legal_name ?? agency.name)}</p>
                ${contatti
                  .map(
                    (riga) =>
                      `<p style="margin:3px 0 0;color:${TESTO_TENUE};font-size:12px;line-height:1.5;">${esc(riga)}</p>`,
                  )
                  .join('')}
                ${agency.vat_number ? `<p style="margin:3px 0 0;color:${TESTO_TENUE};font-size:12px;">P. IVA ${esc(agency.vat_number)}</p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    agency.name.toUpperCase(),
    '',
    dati.titolo,
    '',
    ...dati.paragrafi,
    ...(dati.dettagli && dati.dettagli.length > 0
      ? ['', ...dati.dettagli.map((riga) => `${riga.label}: ${riga.value}`)]
      : []),
    ...(dati.azione ? ['', `${dati.azione.label}: ${dati.azione.href}`] : []),
    ...(dati.chiusura ? ['', dati.chiusura] : []),
    ...(firma ? ['', firma] : []),
    '',
    '—',
    agency.legal_name ?? agency.name,
    ...contattiAgenzia(agency),
    ...(agency.vat_number ? [`P. IVA ${agency.vat_number}`] : []),
  ].join('\n')

  return { html, text }
}

// --- Preventivo ---------------------------------------------------------------
export function messaggioPreventivo(dati: {
  mittente: MittenteAgenzia
  destinatarioNome: string
  quote: { code: string; title: string; destination: string; departure_date: string | null; pax_count: number; valid_until: string | null }
  link: string
  testoLibero?: string | null
}): Messaggio {
  const { quote } = dati
  const paragrafi = [
    `Gentile ${dati.destinatarioNome}, ecco la proposta di viaggio che abbiamo preparato per lei.`,
    ...(dati.testoLibero?.trim() ? [dati.testoLibero.trim()] : []),
    'Dal collegamento qui sotto può vedere le proposte a confronto, con quello che è compreso, e accettare quella che preferisce. Non serve alcuna registrazione.',
  ]

  const dettagli: Dettaglio[] = [
    { label: 'Preventivo', value: quote.code },
    { label: 'Viaggio', value: `${quote.title} · ${quote.destination}` },
    ...(quote.departure_date
      ? [{ label: 'Partenza', value: formatDateLong(quote.departure_date) }]
      : []),
    { label: 'Partecipanti', value: `${quote.pax_count}` },
    ...(quote.valid_until
      ? [{ label: 'Valido fino al', value: formatDateShort(quote.valid_until) }]
      : []),
  ]

  const { html, text } = impagina({
    occhiello: 'Proposta di viaggio',
    titolo: quote.title,
    paragrafi,
    dettagli,
    azione: { label: 'Vedi il preventivo', href: dati.link },
    chiusura: 'Restiamo a disposizione per qualsiasi domanda o modifica.',
    mittente: dati.mittente,
  })

  return { subject: `Il suo preventivo ${quote.code} — ${quote.destination}`, html, text }
}

// --- Fattura -------------------------------------------------------------------
export function messaggioFattura(dati: {
  mittente: MittenteAgenzia
  destinatarioNome: string
  invoice: {
    code: string
    kind: 'fattura' | 'nota_credito'
    issue_date: string | null
    due_date: string | null
    total_cents: number
  }
  bookingCode?: string | null
  allegato: boolean
}): Messaggio {
  const nota = dati.invoice.kind === 'nota_credito'
  const nome = nota ? 'nota di credito' : 'fattura'

  const paragrafi = [
    `Gentile ${dati.destinatarioNome}, in allegato trova la ${nome} ${dati.invoice.code}${
      dati.invoice.issue_date ? ` del ${formatDateShort(dati.invoice.issue_date)}` : ''
    }.`,
    ...(dati.allegato
      ? []
      : ['Il documento è disponibile in agenzia: ce lo chieda e glielo inviamo subito.']),
    ...(nota
      ? ['La nota di credito storna in tutto o in parte la fattura a cui si riferisce.']
      : dati.invoice.due_date
        ? [`Il pagamento è atteso entro il ${formatDateShort(dati.invoice.due_date)}.`]
        : []),
  ]

  const dettagli: Dettaglio[] = [
    { label: nota ? 'Nota di credito' : 'Fattura', value: dati.invoice.code },
    ...(dati.bookingCode ? [{ label: 'Pratica', value: dati.bookingCode }] : []),
    { label: 'Totale', value: `${nota ? '− ' : ''}${formatEuro(dati.invoice.total_cents)}` },
    ...(dati.invoice.due_date && !nota
      ? [{ label: 'Scadenza', value: formatDateShort(dati.invoice.due_date) }]
      : []),
  ]

  const { html, text } = impagina({
    occhiello: 'Documento contabile',
    titolo: `${nota ? 'Nota di credito' : 'Fattura'} ${dati.invoice.code}`,
    paragrafi,
    dettagli,
    chiusura: 'Grazie per aver viaggiato con noi.',
    mittente: dati.mittente,
  })

  return {
    subject: `${nota ? 'Nota di credito' : 'Fattura'} ${dati.invoice.code}`,
    html,
    text,
  }
}

// --- Promemoria di pagamento ----------------------------------------------------
export function messaggioPromemoria(dati: {
  mittente: MittenteAgenzia
  destinatarioNome: string
  booking: { code: string; title: string; destination: string; departure_date: string | null }
  importoCents: number
  scadenza: string
  testoLibero?: string | null
}): Messaggio {
  const paragrafi = [
    `Gentile ${dati.destinatarioNome}, le ricordiamo la scadenza di pagamento per il suo viaggio a ${dati.booking.destination}.`,
    ...(dati.testoLibero?.trim() ? [dati.testoLibero.trim()] : []),
    'Se ha già effettuato il pagamento, consideri questo messaggio come non inviato: i tempi di accredito possono richiedere qualche giorno.',
  ]

  const dettagli: Dettaglio[] = [
    { label: 'Pratica', value: dati.booking.code },
    { label: 'Viaggio', value: `${dati.booking.title} · ${dati.booking.destination}` },
    ...(dati.booking.departure_date
      ? [{ label: 'Partenza', value: formatDateLong(dati.booking.departure_date) }]
      : []),
    { label: 'Importo', value: formatEuro(dati.importoCents) },
    { label: 'Scadenza', value: formatDateShort(dati.scadenza) },
  ]

  const { html, text } = impagina({
    occhiello: 'Promemoria di pagamento',
    titolo: `Scadenza del ${formatDateShort(dati.scadenza)}`,
    paragrafi,
    dettagli,
    chiusura: 'Per qualsiasi chiarimento siamo a sua disposizione.',
    mittente: dati.mittente,
  })

  return {
    subject: `Promemoria di pagamento · pratica ${dati.booking.code}`,
    html,
    text,
  }
}

// --- Prova di configurazione ------------------------------------------------------
export function messaggioProva(dati: { mittente: MittenteAgenzia; destinatario: string }): Messaggio {
  const { html, text } = impagina({
    occhiello: 'Prova di configurazione',
    titolo: 'La posta del gestionale funziona',
    paragrafi: [
      `Questo messaggio è stato inviato a ${dati.destinatario} dal gestionale di ${dati.mittente.agency.name}.`,
      'Se lo sta leggendo, il collegamento con il fornitore di posta è attivo: preventivi, fatture e promemoria partiranno da questo stesso indirizzo.',
    ],
    chiusura: 'Può cancellare questo messaggio.',
    mittente: dati.mittente,
  })

  return { subject: 'Prova di invio dal gestionale', html, text }
}
