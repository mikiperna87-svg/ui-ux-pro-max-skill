import type { Enums } from '@/lib/database.types'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export const BOOKING_STATUS: Record<Enums['booking_status'], { label: string; tone: Tone }> = {
  opzione: { label: 'Opzione', tone: 'warning' },
  confermata: { label: 'Confermata', tone: 'accent' },
  partita: { label: 'Partita', tone: 'info' },
  rientrata: { label: 'Rientrata', tone: 'success' },
  annullata: { label: 'Annullata', tone: 'danger' },
}

export const PAYMENT_STATE: Record<Enums['payment_state'], { label: string; tone: Tone }> = {
  non_pagata: { label: 'Non pagata', tone: 'neutral' },
  acconto_versato: { label: 'Acconto versato', tone: 'info' },
  saldata: { label: 'Saldata', tone: 'success' },
  in_ritardo: { label: 'In ritardo', tone: 'danger' },
}

export const PAYOUT_STATUS: Record<Enums['payout_status'], { label: string; tone: Tone }> = {
  da_pagare: { label: 'Da pagare', tone: 'warning' },
  programmato: { label: 'Programmato', tone: 'info' },
  pagato: { label: 'Pagato', tone: 'success' },
  stornato: { label: 'Stornato', tone: 'neutral' },
}

/**
 * Stato di una scadenza verso il cliente, com'è calcolato dalla vista
 * `installment_list` e da `attribuisciIncassi()`. Non è un enum del database:
 * nasce dall'incrocio fra la rata e gli incassi già attribuiti.
 */
export type InstallmentState = 'saldata' | 'parziale' | 'scaduta' | 'attesa'

export const INSTALLMENT_STATE: Record<InstallmentState, { label: string; tone: Tone }> = {
  saldata: { label: 'Saldata', tone: 'success' },
  parziale: { label: 'Parziale', tone: 'info' },
  scaduta: { label: 'Scaduta', tone: 'danger' },
  attesa: { label: 'Da incassare', tone: 'neutral' },
}

export function isInstallmentState(value: string | null | undefined): value is InstallmentState {
  return value === 'saldata' || value === 'parziale' || value === 'scaduta' || value === 'attesa'
}

export const QUOTE_STATUS: Record<Enums['quote_status'], { label: string; tone: Tone }> = {
  bozza: { label: 'Bozza', tone: 'neutral' },
  inviato: { label: 'Inviato', tone: 'info' },
  accettato: { label: 'Accettato', tone: 'success' },
  rifiutato: { label: 'Rifiutato', tone: 'danger' },
  scaduto: { label: 'Scaduto', tone: 'warning' },
  convertito: { label: 'Convertito', tone: 'success' },
}

/**
 * Le tre proposte di un preventivo. I nomi sono quelli che il cliente legge
 * accanto al prezzo, quindi dicono che cosa cambia, non un livello astratto.
 */
export const QUOTE_VARIANT: Record<Enums['quote_variant'], { label: string; note: string }> = {
  base: { label: 'Essenziale', note: 'Il viaggio con l’indispensabile' },
  consigliata: { label: 'Consigliata', note: 'Il migliore equilibrio fra spesa e comodità' },
  premium: { label: 'Premium', note: 'Sistemazioni e servizi superiori' },
}

/**
 * Il nome di una proposta preceduto dall'articolo giusto.
 *
 * "Accetto la essenziale" è italiano sbagliato, e compare in un bottone che
 * legge il cliente: davanti a vocale l'articolo si elide.
 */
export function varianteConArticolo(variant: Enums['quote_variant']): string {
  const nome = QUOTE_VARIANT[variant].label.toLowerCase()
  return /^[aeiou]/.test(nome) ? `l’${nome}` : `la ${nome}`
}

export const TASK_STATUS: Record<Enums['task_status'], { label: string; tone: Tone }> = {
  aperto: { label: 'Aperto', tone: 'warning' },
  in_corso: { label: 'In corso', tone: 'info' },
  completato: { label: 'Completato', tone: 'success' },
  annullato: { label: 'Annullato', tone: 'neutral' },
}

export const TASK_PRIORITY: Record<Enums['task_priority'], { label: string; tone: Tone }> = {
  bassa: { label: 'Bassa', tone: 'neutral' },
  media: { label: 'Media', tone: 'info' },
  alta: { label: 'Alta', tone: 'warning' },
  urgente: { label: 'Urgente', tone: 'danger' },
}

export const INSTALLMENT_KIND: Record<Enums['installment_kind'], string> = {
  acconto: 'Acconto',
  saldo: 'Saldo',
  rata: 'Rata',
}

export const PAYMENT_IN_KIND: Record<Enums['payment_in_kind'], string> = {
  acconto: 'Acconto',
  saldo: 'Saldo',
  extra: 'Extra',
  rimborso: 'Rimborso',
}

export const PAYMENT_METHOD: Record<Enums['payment_method'], string> = {
  contanti: 'Contanti',
  pos: 'POS',
  bonifico: 'Bonifico',
  assegno: 'Assegno',
  link_pagamento: 'Link di pagamento',
  compensazione: 'Compensazione',
}

export const INVOICE_STATUS: Record<Enums['invoice_status'], { label: string; tone: Tone }> = {
  bozza: { label: 'Bozza', tone: 'neutral' },
  emessa: { label: 'Emessa', tone: 'info' },
  inviata: { label: 'Inviata', tone: 'accent' },
  pagata: { label: 'Pagata', tone: 'success' },
  annullata: { label: 'Annullata', tone: 'danger' },
}

export const INVOICE_KIND: Record<Enums['invoice_kind'], string> = {
  fattura: 'Fattura',
  nota_credito: 'Nota di credito',
}

/**
 * Stato di incasso di un documento, calcolato dalla vista e non scritto sulla
 * riga. "Non dovuta" è la bozza o il documento annullato: non c'è ancora nulla
 * da incassare.
 */
export type InvoicePaymentState =
  | 'da_incassare'
  | 'parziale'
  | 'pagata'
  | 'non_dovuta'
  | 'nota_credito'

export const INVOICE_PAYMENT_STATE: Record<InvoicePaymentState, { label: string; tone: Tone }> = {
  da_incassare: { label: 'Da incassare', tone: 'warning' },
  parziale: { label: 'Incassata in parte', tone: 'info' },
  pagata: { label: 'Incassata', tone: 'success' },
  non_dovuta: { label: 'Non dovuta', tone: 'neutral' },
  nota_credito: { label: 'A storno', tone: 'neutral' },
}

export function isInvoicePaymentState(
  value: string | null | undefined,
): value is InvoicePaymentState {
  return (
    value === 'da_incassare' ||
    value === 'parziale' ||
    value === 'pagata' ||
    value === 'non_dovuta' ||
    value === 'nota_credito'
  )
}

/** I mesi come li scrive un registro IVA: per esteso, in minuscolo. */
export const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const

export function nomeMese(mese: number): string {
  return MESI[mese - 1] ?? ''
}

export const SALE_TYPE: Record<Enums['sale_type'], string> = {
  intermediazione: 'Intermediazione',
  organizzazione: 'Organizzazione',
}

export const VAT_REGIME: Record<Enums['vat_regime'], { label: string; note: string }> = {
  ordinaria: { label: 'IVA ordinaria', note: 'IVA scorporata dal corrispettivo.' },
  art_74_ter: {
    label: 'Art. 74-ter',
    note: 'Regime speciale agenzie di viaggio: IVA calcolata sul margine, non sul corrispettivo.',
  },
  esente_art_10: { label: 'Esente art. 10', note: 'Operazione esente da IVA.' },
  fuori_campo: { label: 'Fuori campo IVA', note: 'Somma incassata per conto del fornitore.' },
  reverse_charge: { label: 'Inversione contabile', note: 'IVA assolta dal committente.' },
}

export const SERVICE_TYPE: Record<Enums['service_type'], string> = {
  volo: 'Volo',
  hotel: 'Hotel',
  transfer: 'Transfer',
  assicurazione: 'Assicurazione',
  escursione: 'Escursione',
  biglietteria: 'Biglietteria',
  noleggio: 'Noleggio',
  visto: 'Visto',
  pacchetto: 'Pacchetto',
  altro: 'Altro',
}

export const SUPPLIER_KIND: Record<Enums['supplier_kind'], string> = {
  tour_operator: 'Tour operator',
  compagnia_aerea: 'Compagnia aerea',
  compagnia_ferroviaria: 'Compagnia ferroviaria',
  compagnia_marittima: 'Compagnia marittima',
  hotel: 'Hotel',
  dmc: 'DMC / corrispondente',
  assicurazione: 'Assicurazione',
  noleggio: 'Noleggio',
  altro: 'Altro',
}

export const ACTIVITY_ACTION: Record<Enums['activity_action'], string> = {
  creazione: 'Creazione',
  modifica: 'Modifica',
  eliminazione: 'Eliminazione',
  cambio_stato: 'Cambio di stato',
  incasso: 'Incasso',
  pagamento: 'Pagamento',
  emissione_documento: 'Emissione documento',
  annullamento: 'Annullamento',
}

/**
 * Concordanza di numero in italiano.
 *
 * "1 pratiche" è il genere di sciatteria che fa sembrare un gestionale un
 * prototipo: il conteggio e il sostantivo vanno d’accordo sempre, anche a zero
 * (che in italiano vuole il plurale: "0 pratiche").
 */
export function plurale(quantita: number, singolare: string, plurale: string): string {
  return `${quantita} ${quantita === 1 ? singolare : plurale}`
}
