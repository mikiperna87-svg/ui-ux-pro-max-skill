import { etichettaNatura } from '@/lib/sdi/codici'

/**
 * Il generatore del file XML FatturaPA versione 1.2.
 *
 * E' una funzione pura: prende una struttura gia' pronta e restituisce una
 * stringa. Non tocca il database, non legge l'ora, non genera identificativi.
 * Serve a poterla provare per intero — ed e' l'unico modo di avere fiducia in
 * un tracciato che, se sbagliato, viene rifiutato senza spiegazioni utili.
 *
 * Gli importi entrano in centesimi, come ovunque nel gestionale, e escono in
 * decimale con il punto: la conversione avviene in un posto solo, in fondo a
 * questo file.
 */

export interface Anagrafica {
  /** Denominazione per societa' e ditte, oppure nome e cognome per le persone. */
  readonly denominazione?: string | null
  readonly nome?: string | null
  readonly cognome?: string | null
  /** Sigla del paese della partita IVA, due lettere. */
  readonly paeseIva?: string | null
  readonly partitaIva?: string | null
  readonly codiceFiscale?: string | null
  readonly indirizzo: string
  readonly cap: string
  readonly comune: string
  readonly provincia?: string | null
  readonly nazione: string
}

export interface Cedente extends Anagrafica {
  readonly regimeFiscale: string
  readonly rea?: {
    readonly ufficio: string
    readonly numero: string
    readonly capitaleCentesimi?: number | null
    readonly socioUnico: boolean
    readonly inLiquidazione: boolean
  } | null
}

export interface RigaTracciato {
  readonly numero: number
  readonly descrizione: string
  readonly quantita: number
  /** Imponibile della riga, in centesimi. Il prezzo unitario si ricava da qui. */
  readonly prezzoTotaleCentesimi: number
  /** Aliquota in centesimi di punto: 2200 = 22%. */
  readonly aliquotaBps: number
  readonly natura?: string | null
}

export interface RiepilogoTracciato {
  readonly aliquotaBps: number
  readonly natura?: string | null
  readonly imponibileCentesimi: number
  readonly impostaCentesimi: number
  readonly riferimentoNormativo?: string | null
}

export interface Pagamento {
  readonly condizioni: string
  readonly modalita: string
  readonly scadenza?: string | null
  readonly importoCentesimi: number
  readonly iban?: string | null
}

export interface DocumentoTracciato {
  readonly tipo: 'TD01' | 'TD04'
  readonly data: string
  readonly numero: string
  readonly totaleCentesimi: number
  readonly bolloCentesimi: number
  readonly causale?: string | null
  /** Per la nota di credito: la fattura che rettifica. */
  readonly documentoRettificato?: { readonly numero: string; readonly data: string } | null
}

export interface DatiTracciato {
  readonly trasmissione: {
    readonly paeseTrasmittente: string
    readonly codiceTrasmittente: string
    readonly progressivo: string
    readonly codiceDestinatario: string
    readonly pecDestinatario?: string | null
  }
  readonly cedente: Cedente
  readonly cessionario: Anagrafica
  readonly documento: DocumentoTracciato
  readonly righe: readonly RigaTracciato[]
  readonly riepiloghi: readonly RiepilogoTracciato[]
  readonly pagamento?: Pagamento | null
}

// --- Mattoni ------------------------------------------------------------------

/**
 * L'escape XML, con `'` e `"` compresi.
 *
 * Non basta pensare agli attributi: un apostrofo dentro «Viaggi dell'Est» non
 * romperebbe il file, ma i parser a valle sono tanti e alcuni sono vecchi.
 */
function esc(valore: string): string {
  return valore
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Da centesimi a decimale con il punto, come vuole il tracciato. */
export function daCentesimi(centesimi: number, decimali = 2): string {
  const segno = centesimi < 0 ? '-' : ''
  const intero = Math.abs(Math.trunc(centesimi))
  const unita = Math.trunc(intero / 100)
  const resto = intero % 100
  const base = `${segno}${unita}.${String(resto).padStart(2, '0')}`
  return decimali > 2 ? `${base}${'0'.repeat(decimali - 2)}` : base
}

/**
 * Il prezzo unitario, ricavato dividendo il totale di riga per la quantità.
 *
 * Il totale è il numero che conta — deve tornare con la fattura — quindi è
 * quello a restare intero, e la divisione si porta fino a otto decimali, che
 * è quanto il tracciato concede. Arrotondare il prezzo unitario a due decimali
 * e poi moltiplicarlo darebbe un totale diverso da quello fatturato.
 */
export function prezzoUnitario(totaleCentesimi: number, quantita: number): string {
  const q = quantita > 0 ? quantita : 1
  const valore = totaleCentesimi / 100 / q
  const testo = valore.toFixed(8)
  // Si tolgono gli zeri in coda, ma mai sotto i due decimali.
  const potato = testo.replace(/(\.\d{2}\d*?)0+$/, '$1')
  return potato
}

/** Da centesimi di punto a percentuale: 2200 → "22.00". */
export function daBps(bps: number): string {
  const unita = Math.trunc(bps / 100)
  const resto = Math.abs(bps % 100)
  return `${unita}.${String(resto).padStart(2, '0')}`
}

/**
 * Un elemento. Il valore `null`, `undefined` o stringa vuota non produce
 * niente: nel tracciato un elemento facoltativo lasciato vuoto viene scartato,
 * mentre assente va benissimo.
 */
function tag(nome: string, valore: string | number | null | undefined, livello: number): string {
  if (valore === null || valore === undefined || valore === '') return ''
  return `${'  '.repeat(livello)}<${nome}>${esc(String(valore))}</${nome}>\n`
}

/** Un blocco con figli. Se i figli sono tutti vuoti, il blocco non esiste. */
function blocco(nome: string, figli: string, livello: number): string {
  if (figli.trim() === '') return ''
  const rientro = '  '.repeat(livello)
  return `${rientro}<${nome}>\n${figli}${rientro}</${nome}>\n`
}

function anagraficaXml(a: Anagrafica, livello: number): string {
  const idFiscale = blocco(
    'IdFiscaleIVA',
    tag('IdPaese', a.paeseIva, livello + 2) + tag('IdCodice', a.partitaIva, livello + 2),
    livello + 1,
  )
  const nomeCognome = tag('Nome', a.nome, livello + 2) + tag('Cognome', a.cognome, livello + 2)
  const anagrafica = blocco(
    'Anagrafica',
    a.denominazione
      ? tag('Denominazione', a.denominazione, livello + 2)
      : nomeCognome,
    livello + 1,
  )
  return idFiscale + tag('CodiceFiscale', a.codiceFiscale, livello + 1) + anagrafica
}

function sedeXml(a: Anagrafica, livello: number): string {
  return blocco(
    'Sede',
    tag('Indirizzo', a.indirizzo, livello + 1) +
      tag('CAP', a.cap, livello + 1) +
      tag('Comune', a.comune, livello + 1) +
      tag('Provincia', a.provincia, livello + 1) +
      tag('Nazione', a.nazione, livello + 1),
    livello,
  )
}

// --- Il file ------------------------------------------------------------------

export function costruisciXml(dati: DatiTracciato): string {
  const { trasmissione: t, cedente, cessionario, documento: d } = dati

  const datiTrasmissione = blocco(
    'DatiTrasmissione',
    blocco(
      'IdTrasmittente',
      tag('IdPaese', t.paeseTrasmittente, 5) + tag('IdCodice', t.codiceTrasmittente, 5),
      4,
    ) +
      tag('ProgressivoInvio', t.progressivo, 4) +
      tag('FormatoTrasmissione', 'FPR12', 4) +
      tag('CodiceDestinatario', t.codiceDestinatario, 4) +
      // La PEC si scrive solo quando il destinatario non ha un codice suo:
      // insieme al codice vero SdI la considera un errore.
      (t.codiceDestinatario === '0000000' ? tag('PECDestinatario', t.pecDestinatario, 4) : ''),
    3,
  )

  const reaXml = cedente.rea
    ? blocco(
        'IscrizioneREA',
        tag('Ufficio', cedente.rea.ufficio, 5) +
          tag('NumeroREA', cedente.rea.numero, 5) +
          tag(
            'CapitaleSociale',
            cedente.rea.capitaleCentesimi === null || cedente.rea.capitaleCentesimi === undefined
              ? null
              : daCentesimi(cedente.rea.capitaleCentesimi),
            5,
          ) +
          tag('SocioUnico', cedente.rea.socioUnico ? 'SU' : 'SM', 5) +
          tag('StatoLiquidazione', cedente.rea.inLiquidazione ? 'LS' : 'LN', 5),
        4,
      )
    : ''

  const cedenteXml = blocco(
    'CedentePrestatore',
    blocco(
      'DatiAnagrafici',
      anagraficaXml(cedente, 4) + tag('RegimeFiscale', cedente.regimeFiscale, 5),
      4,
    ) +
      sedeXml(cedente, 4) +
      reaXml,
    3,
  )

  const cessionarioXml = blocco(
    'CessionarioCommittente',
    blocco('DatiAnagrafici', anagraficaXml(cessionario, 4), 4) + sedeXml(cessionario, 4),
    3,
  )

  const header = blocco(
    'FatturaElettronicaHeader',
    datiTrasmissione + cedenteXml + cessionarioXml,
    1,
  )

  const bollo =
    d.bolloCentesimi > 0
      ? blocco(
          'DatiBollo',
          tag('BolloVirtuale', 'SI', 5) + tag('ImportoBollo', daCentesimi(d.bolloCentesimi), 5),
          4,
        )
      : ''

  const datiGenerali = blocco(
    'DatiGenerali',
    blocco(
      'DatiGeneraliDocumento',
      tag('TipoDocumento', d.tipo, 5) +
        tag('Divisa', 'EUR', 5) +
        tag('Data', d.data, 5) +
        tag('Numero', d.numero, 5) +
        bollo +
        tag('ImportoTotaleDocumento', daCentesimi(d.totaleCentesimi), 5) +
        tag('Causale', d.causale, 5),
      4,
    ) +
      (d.documentoRettificato
        ? blocco(
            'DatiFatture',
            blocco(
              'DatiFattureCollegate',
              tag('IdDocumento', d.documentoRettificato.numero, 6) +
                tag('Data', d.documentoRettificato.data, 6),
              5,
            ),
            4,
          )
        : ''),
    3,
  )

  const righe = dati.righe
    .map((r) =>
      blocco(
        'DettaglioLinee',
        tag('NumeroLinea', r.numero, 5) +
          tag('Descrizione', r.descrizione, 5) +
          tag('Quantita', r.quantita.toFixed(2), 5) +
          tag('PrezzoUnitario', prezzoUnitario(r.prezzoTotaleCentesimi, r.quantita), 5) +
          tag('PrezzoTotale', daCentesimi(r.prezzoTotaleCentesimi), 5) +
          tag('AliquotaIVA', daBps(r.aliquotaBps), 5) +
          // Natura e aliquota si escludono: con un'aliquota diversa da zero la
          // Natura fa scartare il file, e con l'aliquota a zero la sua assenza
          // fa lo stesso.
          (r.aliquotaBps === 0 ? tag('Natura', r.natura, 5) : ''),
        4,
      ),
    )
    .join('')

  const riepiloghi = dati.riepiloghi
    .map((r) =>
      blocco(
        'DatiRiepilogo',
        tag('AliquotaIVA', daBps(r.aliquotaBps), 5) +
          (r.aliquotaBps === 0 ? tag('Natura', r.natura, 5) : '') +
          tag('ImponibileImporto', daCentesimi(r.imponibileCentesimi), 5) +
          tag('Imposta', daCentesimi(r.impostaCentesimi), 5) +
          tag('EsigibilitaIVA', 'I', 5) +
          (r.aliquotaBps === 0 ? tag('RiferimentoNormativo', r.riferimentoNormativo, 5) : ''),
        4,
      ),
    )
    .join('')

  const datiBeniServizi = blocco('DatiBeniServizi', righe + riepiloghi, 3)

  const pagamento = dati.pagamento
    ? blocco(
        'DatiPagamento',
        tag('CondizioniPagamento', dati.pagamento.condizioni, 4) +
          blocco(
            'DettaglioPagamento',
            tag('ModalitaPagamento', dati.pagamento.modalita, 5) +
              tag('DataScadenzaPagamento', dati.pagamento.scadenza, 5) +
              tag('ImportoPagamento', daCentesimi(dati.pagamento.importoCentesimi), 5) +
              tag('IBAN', dati.pagamento.iban, 5),
            4,
          ),
        3,
      )
    : ''

  const body = blocco(
    'FatturaElettronicaBody',
    datiGenerali + datiBeniServizi + pagamento,
    1,
  )

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<p:FatturaElettronica versione="FPR12"' +
    ' xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n' +
    header +
    body +
    '</p:FatturaElettronica>\n'
  )
}

/**
 * Il nome del file, che SdI usa come chiave: paese + identificativo del
 * trasmittente + progressivo. Due file con lo stesso nome dallo stesso
 * trasmittente vengono rifiutati, ed e' il motivo per cui il progressivo
 * arriva da un contatore sul database e non da un orologio.
 */
export function nomeFile(paese: string, codice: string, progressivo: string): string {
  return `${paese.toUpperCase()}${codice}_${progressivo}.xml`
}

/** L'etichetta leggibile di una Natura, per i messaggi all'utente. */
export function descriviNatura(codice: string | null | undefined): string {
  if (!codice) return '—'
  return etichettaNatura(codice) ?? codice
}
