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
