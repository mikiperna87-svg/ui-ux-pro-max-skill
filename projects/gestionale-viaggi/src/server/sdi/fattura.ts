import 'server-only'

import { normalizeVatNumber } from '@/lib/fiscal'
import { riepiloghiDaRighe, righeTracciato, totaleDocumento, type RigaFattura } from '@/lib/sdi/riepilogo'
import { costruisciXml, nomeFile, type DatiTracciato } from '@/lib/sdi/tracciato'
import type { RegimeIva } from '@/lib/sdi/codici'
import {
  verificaTutto,
  type AgenziaDaVerificare,
  type EsitoVerifica,
  type FatturaDaVerificare,
  type SoggettoDaVerificare,
} from '@/lib/sdi/validazione'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceDetail } from '@/server/queries/fatture'

/**
 * Il ponte fra la fattura come la tiene il gestionale e il tracciato SdI.
 *
 * Tutto il calcolo vero sta in `src/lib/sdi`, che è codice puro e provato per
 * intero. Qui si legge il database e si traduce, niente di più: è la parte che
 * non si può provare senza un database, quindi è la parte che deve contenere
 * meno logica possibile.
 */

export type EsitoSdi =
  | { readonly esito: 'ok'; readonly xml: string; readonly filename: string }
  | { readonly esito: 'non_trovato' }
  | { readonly esito: 'bozza' }
  | { readonly esito: 'dati_mancanti' }
  | { readonly esito: 'non_valida'; readonly verifica: EsitoVerifica }
  | { readonly esito: 'non_preparata' }

/**
 * Tutti gli esiti tranne il successo.
 *
 * Serve perche' le tre funzioni pubbliche riescono in modi diversi — una
 * restituisce un file, un'altra una verifica — e senza escludere il successo
 * comune TypeScript non saprebbe distinguerle.
 */
export type ProblemaSdi = Exclude<EsitoSdi, { esito: 'ok' }>

/**
 * Quello che può andare storto montando i dati. «Non preparata» non è fra
 * questi: non dipende dai dati, ma dal fatto che nessuno abbia ancora premuto
 * «Prepara», e lo scopre solo chi vuole il file.
 */
type ProblemaMontaggio = Exclude<ProblemaSdi, { esito: 'non_preparata' }>

interface Montaggio {
  readonly agenzia: AgenziaDaVerificare
  readonly cliente: SoggettoDaVerificare
  readonly fattura: FatturaDaVerificare
  readonly righe: readonly RigaFattura[]
  readonly agencyId: string
  readonly progressivo: string | null
  readonly dati: (progressivo: string) => DatiTracciato
}

/**
 * Il codice destinatario da scrivere nel file.
 *
 * Sette zeri quando il cliente non ne ha uno: la fattura resta valida e finisce
 * nel suo cassetto fiscale. Per un cliente estero il codice convenzionale è
 * invece fatto di sette X.
 */
function codiceDestinatario(sdiCode: string | null, nazione: string): string {
  const pulito = sdiCode?.trim().toUpperCase() ?? ''
  if (pulito !== '') return pulito
  return nazione.toUpperCase() === 'IT' ? '0000000' : 'XXXXXXX'
}

async function monta(invoiceId: string): Promise<Montaggio | ProblemaMontaggio> {
  const detail = await getInvoiceDetail(invoiceId)
  if (!detail) return { esito: 'non_trovato' }
  // `code` e `number` restano nulli finché il documento è una bozza: il
  // trigger li assegna all'emissione. Un documento senza numero non è una
  // fattura, e lo stato da solo non basta a garantirlo.
  if (detail.invoice.status === 'bozza' || !detail.invoice.code) return { esito: 'bozza' }
  const numero = detail.invoice.code

  const supabase = await createClient()
  const [{ data: agency }, { data: customer }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', detail.invoice.agency_id).maybeSingle(),
    supabase.from('customers').select('*').eq('id', detail.invoice.customer_id).maybeSingle(),
  ])
  if (!agency || !customer) return { esito: 'dati_mancanti' }

  // La nota di credito deve citare la fattura che rettifica: senza quel
  // riferimento SdI la scarta.
  let rettificato: { numero: string; data: string } | null = null
  if (detail.invoice.credit_note_of) {
    const { data: originale } = await supabase
      .from('invoices')
      .select('code, issue_date')
      .eq('id', detail.invoice.credit_note_of)
      .maybeSingle()
    if (originale?.code) rettificato = { numero: originale.code, data: originale.issue_date }
  }

  const righe: readonly RigaFattura[] = detail.items.map((riga) => ({
    descrizione: riga.description ?? '',
    quantita: riga.quantity ?? 1,
    prezzoUnitarioCentesimi: riga.unit_price_cents ?? 0,
    regime: (riga.vat_regime ?? 'ordinaria') as RegimeIva,
    aliquotaBps: riga.vat_bps ?? 0,
    naturaScavalcata: riga.vat_nature,
  }))

  const azienda = customer.kind === 'azienda'
  const nazioneCliente = (customer.country ?? 'IT').toUpperCase()

  const agenzia: AgenziaDaVerificare = {
    denominazione: agency.legal_name?.trim() || agency.name,
    partitaIva: agency.vat_number,
    codiceFiscale: agency.tax_code,
    indirizzo: agency.address_line,
    cap: agency.postal_code,
    comune: agency.city,
    provincia: agency.province,
    nazione: agency.country ?? 'IT',
    regimeFiscale: agency.sdi_regime,
    reaNumero: agency.rea_number,
    reaUfficio: agency.rea_office,
  }

  const cliente: SoggettoDaVerificare = {
    denominazione: azienda ? customer.company_name : null,
    nome: azienda ? null : customer.first_name,
    cognome: azienda ? null : customer.last_name,
    partitaIva: customer.vat_number,
    codiceFiscale: customer.tax_code,
    indirizzo: customer.address_line,
    cap: customer.postal_code,
    comune: customer.city,
    provincia: customer.province,
    nazione: nazioneCliente,
  }

  const codice = codiceDestinatario(customer.sdi_code, nazioneCliente)

  const fattura: FatturaDaVerificare = {
    tipo: detail.invoice.kind === 'nota_credito' ? 'TD04' : 'TD01',
    numero,
    data: detail.invoice.issue_date,
    righe,
    documentoRettificato: rettificato,
    codiceDestinatario: codice,
    pecDestinatario: customer.pec,
    bolloCentesimi: detail.invoice.stamp_duty_cents ?? 0,
  }

  const riepiloghi = riepiloghiDaRighe(righe)
  const bollo = detail.invoice.stamp_duty_cents ?? 0
  const totale = totaleDocumento(riepiloghi, bollo)

  return {
    agenzia,
    cliente,
    fattura,
    righe,
    agencyId: detail.invoice.agency_id,
    progressivo: detail.invoice.sdi_progressivo,
    dati: (progressivo) => ({
      trasmissione: {
        paeseTrasmittente: 'IT',
        codiceTrasmittente: normalizeVatNumber(agency.vat_number ?? ''),
        progressivo,
        codiceDestinatario: codice,
        pecDestinatario: customer.pec,
      },
      cedente: {
        denominazione: agenzia.denominazione,
        paeseIva: 'IT',
        partitaIva: normalizeVatNumber(agency.vat_number ?? ''),
        codiceFiscale: agency.tax_code,
        indirizzo: agency.address_line ?? '',
        cap: agency.postal_code ?? '',
        comune: agency.city ?? '',
        provincia: agency.province,
        nazione: agency.country ?? 'IT',
        regimeFiscale: agency.sdi_regime,
        rea:
          agency.rea_number && agency.rea_office
            ? {
                ufficio: agency.rea_office,
                numero: agency.rea_number,
                capitaleCentesimi: agency.share_capital_cents,
                socioUnico: agency.sole_shareholder,
                inLiquidazione: agency.in_liquidation,
              }
            : null,
      },
      cessionario: {
        denominazione: cliente.denominazione,
        nome: cliente.nome,
        cognome: cliente.cognome,
        paeseIva: customer.vat_number ? nazioneCliente : null,
        partitaIva: customer.vat_number ? normalizeVatNumber(customer.vat_number) : null,
        codiceFiscale: customer.tax_code,
        indirizzo: customer.address_line ?? '',
        cap: customer.postal_code ?? '',
        comune: customer.city ?? '',
        provincia: customer.province,
        nazione: nazioneCliente,
      },
      documento: {
        tipo: fattura.tipo,
        data: detail.invoice.issue_date,
        numero,
        totaleCentesimi: totale,
        bolloCentesimi: bollo,
        causale: detail.invoice.legal_notes,
        documentoRettificato: rettificato,
      },
      righe: righeTracciato(righe),
      riepiloghi,
      pagamento: {
        condizioni: detail.invoice.payment_condition,
        modalita: detail.invoice.payment_method,
        scadenza: detail.invoice.due_date,
        importoCentesimi: totale,
        iban: agency.iban,
      },
    }),
  }
}

function eUnProblema(valore: Montaggio | ProblemaMontaggio): valore is ProblemaMontaggio {
  return 'esito' in valore
}

/** La verifica preventiva, per il pannello della scheda. Non scrive niente. */
export async function verificaSdi(
  invoiceId: string,
): Promise<{ esito: 'ok'; verifica: EsitoVerifica; agencyId: string } | ProblemaMontaggio> {
  const montaggio = await monta(invoiceId)
  if (eUnProblema(montaggio)) return montaggio
  return {
    esito: 'ok',
    verifica: verificaTutto(montaggio.agenzia, montaggio.cliente, montaggio.fattura),
    agencyId: montaggio.agencyId,
  }
}

/**
 * Il file XML di una fattura già preparata.
 *
 * Il progressivo non si assegna qui: lo assegna l'azione «Prepara», una volta
 * sola. Così scaricare due volte lo stesso documento produce lo stesso file,
 * e una richiesta GET non cambia lo stato di niente.
 */
export async function xmlSdi(invoiceId: string): Promise<EsitoSdi> {
  const montaggio = await monta(invoiceId)
  if (eUnProblema(montaggio)) return montaggio

  if (!montaggio.progressivo) return { esito: 'non_preparata' }

  const verifica = verificaTutto(montaggio.agenzia, montaggio.cliente, montaggio.fattura)
  if (!verifica.trasmettibile) return { esito: 'non_valida', verifica }

  const dati = montaggio.dati(montaggio.progressivo)
  return {
    esito: 'ok',
    xml: costruisciXml(dati),
    filename: nomeFile(
      dati.trasmissione.paeseTrasmittente,
      dati.trasmissione.codiceTrasmittente,
      montaggio.progressivo,
    ),
  }
}

/** I dati montati, per l'azione che assegna il progressivo. */
export async function preparaSdi(
  invoiceId: string,
): Promise<
  | { esito: 'ok'; agencyId: string; verifica: EsitoVerifica; nome: (p: string) => string }
  | ProblemaMontaggio
> {
  const montaggio = await monta(invoiceId)
  if (eUnProblema(montaggio)) return montaggio

  const verifica = verificaTutto(montaggio.agenzia, montaggio.cliente, montaggio.fattura)
  if (!verifica.trasmettibile) return { esito: 'non_valida', verifica }

  const codiceTrasmittente = normalizeVatNumber(montaggio.agenzia.partitaIva ?? '')
  return {
    esito: 'ok',
    agencyId: montaggio.agencyId,
    verifica,
    nome: (progressivo) => nomeFile('IT', codiceTrasmittente, progressivo),
  }
}
