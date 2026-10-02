/**
 * Le tabelle di codici del tracciato FatturaPA.
 *
 * Stanno qui e non sparse nei moduli perche' cambiano: N2 e N6 si sono
 * spezzati in sottocodici nel 2021, e quando succede di nuovo il punto da
 * toccare deve essere uno solo. Ogni voce porta l'etichetta che l'utente
 * legge nel modulo: e' la stessa che l'Agenzia delle Entrate usa, abbreviata
 * dove sarebbe illeggibile.
 */

export interface Voce {
  readonly codice: string
  readonly etichetta: string
}

/** RegimeFiscale del cedente. Obbligatorio nel tracciato. */
export const REGIMI_FISCALI: readonly Voce[] = [
  { codice: 'RF01', etichetta: 'Ordinario' },
  { codice: 'RF02', etichetta: 'Contribuenti minimi' },
  { codice: 'RF04', etichetta: 'Agricoltura e attività connesse e pesca' },
  { codice: 'RF05', etichetta: 'Vendita sali e tabacchi' },
  { codice: 'RF06', etichetta: 'Commercio dei fiammiferi' },
  { codice: 'RF07', etichetta: 'Editoria' },
  { codice: 'RF08', etichetta: 'Gestione servizi telefonia pubblica' },
  { codice: 'RF09', etichetta: 'Rivendita documenti di trasporto pubblico e di sosta' },
  { codice: 'RF10', etichetta: 'Intrattenimenti e giochi' },
  { codice: 'RF11', etichetta: 'Agenzie di viaggi e turismo (art. 74-ter)' },
  { codice: 'RF12', etichetta: 'Agriturismo' },
  { codice: 'RF13', etichetta: 'Vendite a domicilio' },
  { codice: 'RF14', etichetta: 'Rivendita beni usati, oggetti d’arte, d’antiquariato o da collezione' },
  { codice: 'RF15', etichetta: 'Agenzie di vendite all’asta di oggetti d’arte' },
  { codice: 'RF16', etichetta: 'IVA per cassa P.A.' },
  { codice: 'RF17', etichetta: 'IVA per cassa' },
  { codice: 'RF18', etichetta: 'Altro' },
  { codice: 'RF19', etichetta: 'Regime forfettario' },
]

/**
 * Natura dell'operazione: si scrive solo quando l'aliquota IVA e' zero, e in
 * quel caso e' obbligatoria. Il contrario e' altrettanto vero: con
 * un'aliquota diversa da zero la Natura non deve esserci, o SdI scarta.
 */
export const NATURE_IVA: readonly Voce[] = [
  { codice: 'N1', etichetta: 'Escluse ex art. 15' },
  { codice: 'N2.1', etichetta: 'Non soggette ad IVA ex artt. da 7 a 7-septies' },
  { codice: 'N2.2', etichetta: 'Non soggette — altri casi' },
  { codice: 'N3.1', etichetta: 'Non imponibili — esportazioni' },
  { codice: 'N3.2', etichetta: 'Non imponibili — cessioni intracomunitarie' },
  { codice: 'N3.3', etichetta: 'Non imponibili — cessioni verso San Marino' },
  { codice: 'N3.4', etichetta: 'Non imponibili — operazioni assimilate alle cessioni all’esportazione' },
  { codice: 'N3.5', etichetta: 'Non imponibili — a seguito di dichiarazioni d’intento' },
  { codice: 'N3.6', etichetta: 'Non imponibili — altre operazioni che non concorrono al plafond' },
  { codice: 'N4', etichetta: 'Esenti' },
  { codice: 'N5', etichetta: 'Regime del margine / IVA non esposta in fattura' },
  { codice: 'N6.1', etichetta: 'Inversione contabile — rottami ferrosi' },
  { codice: 'N6.2', etichetta: 'Inversione contabile — oro e argento puro' },
  { codice: 'N6.3', etichetta: 'Inversione contabile — subappalto nel settore edile' },
  { codice: 'N6.4', etichetta: 'Inversione contabile — cessione di fabbricati' },
  { codice: 'N6.5', etichetta: 'Inversione contabile — cessione di telefoni cellulari' },
  { codice: 'N6.6', etichetta: 'Inversione contabile — cessione di prodotti elettronici' },
  { codice: 'N6.7', etichetta: 'Inversione contabile — prestazioni comparto edile e settori connessi' },
  { codice: 'N6.8', etichetta: 'Inversione contabile — operazioni settore energetico' },
  { codice: 'N6.9', etichetta: 'Inversione contabile — altri casi' },
  { codice: 'N7', etichetta: 'IVA assolta in altro Stato UE' },
]

/** ModalitaPagamento. */
export const MODALITA_PAGAMENTO: readonly Voce[] = [
  { codice: 'MP01', etichetta: 'Contanti' },
  { codice: 'MP02', etichetta: 'Assegno' },
  { codice: 'MP03', etichetta: 'Assegno circolare' },
  { codice: 'MP05', etichetta: 'Bonifico' },
  { codice: 'MP08', etichetta: 'Carta di pagamento' },
  { codice: 'MP12', etichetta: 'RIBA' },
  { codice: 'MP19', etichetta: 'SEPA Direct Debit' },
  { codice: 'MP21', etichetta: 'SEPA Direct Debit B2B' },
  { codice: 'MP23', etichetta: 'PagoPA' },
]

/** CondizioniPagamento. */
export const CONDIZIONI_PAGAMENTO: readonly Voce[] = [
  { codice: 'TP01', etichetta: 'Pagamento a rate' },
  { codice: 'TP02', etichetta: 'Pagamento completo' },
  { codice: 'TP03', etichetta: 'Anticipo' },
]

/** TipoDocumento, limitato a quelli che questo gestionale emette. */
export const TIPI_DOCUMENTO: readonly Voce[] = [
  { codice: 'TD01', etichetta: 'Fattura' },
  { codice: 'TD04', etichetta: 'Nota di credito' },
]

function indice(voci: readonly Voce[]): ReadonlyMap<string, string> {
  return new Map(voci.map((v) => [v.codice, v.etichetta]))
}

const REGIMI = indice(REGIMI_FISCALI)
const NATURE = indice(NATURE_IVA)
const MODALITA = indice(MODALITA_PAGAMENTO)
const CONDIZIONI = indice(CONDIZIONI_PAGAMENTO)

export const etichettaRegime = (codice: string): string | null => REGIMI.get(codice) ?? null
export const etichettaNatura = (codice: string): string | null => NATURE.get(codice) ?? null
export const etichettaModalita = (codice: string): string | null => MODALITA.get(codice) ?? null
export const etichettaCondizione = (codice: string): string | null => CONDIZIONI.get(codice) ?? null

/** Il regime IVA interno, come lo scrive il database. */
export type RegimeIva =
  | 'ordinaria'
  | 'art_74_ter'
  | 'esente_art_10'
  | 'fuori_campo'
  | 'reverse_charge'

/**
 * La Natura che corrisponde a ciascun regime, e la norma da citare.
 *
 * `null` per l'aliquota ordinaria: li' la Natura non va scritta affatto.
 * Per l'inversione contabile il codice e' il generico N6.9, perche' i
 * sottocodici da N6.1 a N6.8 riguardano rottami, oro, edilizia ed elettronica
 * — nessuno dei quali e' un servizio turistico. Se a un'agenzia servisse uno
 * degli altri, la riga della fattura ha il campo per scavalcarlo.
 */
const DA_REGIME: Readonly<Record<RegimeIva, { natura: string | null; norma: string | null }>> = {
  ordinaria: { natura: null, norma: null },
  art_74_ter: {
    natura: 'N5',
    norma: 'Regime del margine - art. 74-ter DPR 633/72. IVA assolta dall’agenzia.',
  },
  esente_art_10: { natura: 'N4', norma: 'Operazione esente - art. 10 DPR 633/72' },
  fuori_campo: { natura: 'N2.2', norma: 'Operazione non soggetta a IVA' },
  reverse_charge: { natura: 'N6.9', norma: 'Inversione contabile - art. 17 DPR 633/72' },
}

export function naturaDaRegime(regime: RegimeIva): string | null {
  return DA_REGIME[regime].natura
}

export function normaDaRegime(regime: RegimeIva): string | null {
  return DA_REGIME[regime].norma
}
