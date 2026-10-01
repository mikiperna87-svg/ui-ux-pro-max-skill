import { csvBoolean, csvDateToIso, matchHeader } from '@/lib/csv'

/**
 * Corrispondenza fra le colonne di un file CSV e i campi dell'applicazione.
 *
 * Ogni campo dichiara più intestazioni possibili perché i file arrivano dai
 * gestionali più diversi: "Partita IVA", "P.IVA" e "partita_iva" devono
 * funzionare tutti senza chiedere all'utente di rinominare le colonne.
 */
export interface ImportField {
  readonly field: string
  readonly aliases: readonly string[]
  readonly label: string
  readonly required?: boolean
  /** Converte il testo della cella nel valore atteso dallo schema. */
  readonly transform?: (raw: string) => unknown
  /**
   * Valore da usare quando la colonna manca del tutto dal file.
   *
   * I gestionali di provenienza esportano quasi sempre meno colonne di quante
   * ne preveda lo schema: senza un ripiego un elenco di soli nomi e indirizzi
   * verrebbe scartato per intero solo perché manca la colonna "Tipo". Riceve
   * i valori già letti dalla riga, così il ripiego può dedurre dal resto.
   */
  readonly fallback?: (values: Record<string, unknown>) => unknown
}

const asDate = (raw: string) => csvDateToIso(raw) ?? raw
const asBoolean = (raw: string) => (csvBoolean(raw) ? 'on' : '')

const isFilled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== ''

function mapValue(map: Record<string, string>, raw: string, fallback: string): string {
  const key = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  return map[key] ?? fallback
}

export const CUSTOMER_IMPORT_FIELDS: readonly ImportField[] = [
  {
    field: 'kind',
    aliases: ['tipo', 'tipologia', 'tipo_cliente', 'kind'],
    label: 'Tipo',
    transform: (raw) =>
      mapValue(
        { azienda: 'azienda', societa: 'azienda', ditta: 'azienda', company: 'azienda', business: 'azienda' },
        raw,
        'privato',
      ),
    // Senza colonna "Tipo": chi ha una ragione sociale e nessun nome e' un’azienda.
    fallback: (values) =>
      isFilled(values.company_name) && !isFilled(values.last_name) && !isFilled(values.first_name)
        ? 'azienda'
        : 'privato',
  },
  { field: 'last_name', aliases: ['cognome', 'last_name', 'surname'], label: 'Cognome' },
  { field: 'first_name', aliases: ['nome', 'first_name', 'name'], label: 'Nome' },
  {
    field: 'company_name',
    aliases: ['ragione_sociale', 'azienda', 'societa', 'company', 'denominazione'],
    label: 'Ragione sociale',
  },
  { field: 'vat_number', aliases: ['partita_iva', 'piva', 'p_iva', 'vat'], label: 'Partita IVA' },
  { field: 'tax_code', aliases: ['codice_fiscale', 'cf', 'codfis'], label: 'Codice fiscale' },
  { field: 'email', aliases: ['email', 'e_mail', 'posta_elettronica'], label: 'Email' },
  { field: 'phone', aliases: ['telefono', 'tel', 'phone'], label: 'Telefono' },
  { field: 'mobile', aliases: ['cellulare', 'mobile', 'cell'], label: 'Cellulare' },
  { field: 'address_line', aliases: ['indirizzo', 'via', 'address'], label: 'Indirizzo' },
  { field: 'postal_code', aliases: ['cap', 'codice_postale', 'zip'], label: 'CAP' },
  { field: 'city', aliases: ['citta', 'comune', 'city'], label: 'Città' },
  { field: 'province', aliases: ['provincia', 'prov', 'province'], label: 'Provincia' },
  { field: 'birth_date', aliases: ['data_nascita', 'nato_il', 'birth_date'], label: 'Data di nascita', transform: asDate },
  { field: 'birth_place', aliases: ['luogo_nascita', 'nato_a'], label: 'Luogo di nascita' },
  { field: 'tags', aliases: ['tag', 'etichette', 'tags', 'categorie'], label: 'Tag' },
  { field: 'notes', aliases: ['note', 'annotazioni', 'notes'], label: 'Note' },
  {
    field: 'privacy_consent',
    aliases: ['consenso_privacy', 'privacy'],
    label: 'Consenso privacy',
    transform: asBoolean,
  },
  {
    field: 'marketing_consent',
    aliases: ['consenso_marketing', 'marketing', 'newsletter'],
    label: 'Consenso marketing',
    transform: asBoolean,
  },
]

export const PASSENGER_IMPORT_FIELDS: readonly ImportField[] = [
  { field: 'last_name', aliases: ['cognome', 'last_name', 'surname'], label: 'Cognome', required: true },
  { field: 'first_name', aliases: ['nome', 'first_name', 'name'], label: 'Nome', required: true },
  { field: 'birth_date', aliases: ['data_nascita', 'nato_il', 'birth_date'], label: 'Data di nascita', transform: asDate },
  { field: 'birth_place', aliases: ['luogo_nascita', 'nato_a'], label: 'Luogo di nascita' },
  {
    field: 'gender',
    aliases: ['sesso', 'genere', 'gender'],
    label: 'Sesso',
    transform: (raw) => mapValue({ m: 'M', maschio: 'M', male: 'M', f: 'F', femmina: 'F', female: 'F' }, raw, ''),
  },
  { field: 'nationality', aliases: ['nazionalita', 'cittadinanza', 'nationality'], label: 'Nazionalità' },
  { field: 'tax_code', aliases: ['codice_fiscale', 'cf'], label: 'Codice fiscale' },
  { field: 'email', aliases: ['email', 'e_mail'], label: 'Email' },
  { field: 'phone', aliases: ['telefono', 'cellulare', 'tel'], label: 'Telefono' },
  {
    field: 'document_type',
    aliases: ['tipo_documento', 'documento', 'document_type'],
    label: 'Tipo documento',
    transform: (raw) =>
      mapValue(
        {
          passaporto: 'passaporto',
          passport: 'passaporto',
          cartadidentita: 'carta_identita',
          ci: 'carta_identita',
          carta: 'carta_identita',
          patente: 'patente',
          permessodisoggiorno: 'permesso_soggiorno',
        },
        raw,
        '',
      ),
  },
  { field: 'document_number', aliases: ['numero_documento', 'n_documento', 'document_number'], label: 'Numero documento' },
  { field: 'document_issued_at', aliases: ['rilascio', 'data_rilascio'], label: 'Rilascio', transform: asDate },
  { field: 'document_expires_at', aliases: ['scadenza', 'data_scadenza', 'scadenza_documento'], label: 'Scadenza', transform: asDate },
  { field: 'document_issuer', aliases: ['rilasciato_da', 'ente_rilascio'], label: 'Rilasciato da' },
  { field: 'dietary_needs', aliases: ['esigenze_alimentari', 'dieta', 'allergie'], label: 'Esigenze alimentari' },
  { field: 'special_needs', aliases: ['esigenze_particolari', 'note_speciali'], label: 'Esigenze particolari' },
  { field: 'notes', aliases: ['note', 'annotazioni'], label: 'Note' },
]

export const SUPPLIER_IMPORT_FIELDS: readonly ImportField[] = [
  { field: 'name', aliases: ['nome', 'denominazione', 'fornitore', 'name'], label: 'Nome', required: true },
  {
    field: 'kind',
    aliases: ['tipo', 'tipologia', 'categoria', 'kind'],
    label: 'Tipo',
    transform: (raw) =>
      mapValue(
        {
          touroperator: 'tour_operator',
          to: 'tour_operator',
          compagniaaerea: 'compagnia_aerea',
          aerea: 'compagnia_aerea',
          volo: 'compagnia_aerea',
          ferroviaria: 'compagnia_ferroviaria',
          treno: 'compagnia_ferroviaria',
          marittima: 'compagnia_marittima',
          nave: 'compagnia_marittima',
          hotel: 'hotel',
          albergo: 'hotel',
          dmc: 'dmc',
          corrispondente: 'dmc',
          assicurazione: 'assicurazione',
          noleggio: 'noleggio',
          autonoleggio: 'noleggio',
        },
        raw,
        'altro',
      ),
    fallback: () => 'altro',
  },
  { field: 'legal_name', aliases: ['ragione_sociale', 'legal_name'], label: 'Ragione sociale' },
  { field: 'vat_number', aliases: ['partita_iva', 'piva', 'vat'], label: 'Partita IVA' },
  { field: 'tax_code', aliases: ['codice_fiscale', 'cf'], label: 'Codice fiscale' },
  { field: 'email', aliases: ['email', 'e_mail'], label: 'Email' },
  { field: 'pec', aliases: ['pec'], label: 'PEC' },
  { field: 'phone', aliases: ['telefono', 'tel'], label: 'Telefono' },
  { field: 'contact_name', aliases: ['referente', 'contatto', 'contact'], label: 'Referente' },
  { field: 'address_line', aliases: ['indirizzo', 'via'], label: 'Indirizzo' },
  { field: 'postal_code', aliases: ['cap'], label: 'CAP' },
  { field: 'city', aliases: ['citta', 'comune'], label: 'Città' },
  { field: 'province', aliases: ['provincia', 'prov'], label: 'Provincia' },
  { field: 'iban', aliases: ['iban'], label: 'IBAN' },
  {
    field: 'payment_terms_days',
    aliases: ['giorni_pagamento', 'dilazione', 'pagamento_giorni', 'termini_pagamento'],
    label: 'Giorni di pagamento',
    transform: (raw) => (raw === '' ? 30 : raw.replace(',', '.')),
    fallback: () => 30,
  },
  {
    field: 'default_commission_percent',
    aliases: ['commissione', 'commissione_percentuale', 'provvigione'],
    label: 'Commissione %',
    transform: (raw) => (raw === '' ? 0 : raw.replace('%', '').replace(',', '.').trim()),
    fallback: () => 0,
  },
  {
    field: 'default_vat_regime',
    aliases: ['regime_iva', 'iva', 'regime'],
    label: 'Regime IVA',
    transform: (raw) =>
      mapValue(
        {
          ordinaria: 'ordinaria',
          ter: 'art_74_ter',
          margine: 'art_74_ter',
          esente: 'esente_art_10',
          fuoricampo: 'fuori_campo',
          reversecharge: 'reverse_charge',
          inversione: 'reverse_charge',
        },
        raw,
        'art_74_ter',
      ),
    // Il regime piu' frequente per un'agenzia che rivende pacchetti.
    fallback: () => 'art_74_ter',
  },
  { field: 'notes', aliases: ['note', 'annotazioni'], label: 'Note' },
  { field: 'is_active', aliases: ['attivo', 'active'], label: 'Attivo', transform: asBoolean },
]

export interface HeaderMapping {
  readonly field: string
  readonly label: string
  readonly header: string | null
  readonly required: boolean
}

/**
 * Associa le intestazioni del file ai campi previsti.
 *
 * Fra i nomi accettati c'e' sempre l'etichetta del campo: e' l'intestazione
 * che il modello scaricabile stampa, e un modello che non si lascia
 * reimportare e' il modo piu' rapido di perdere chi sta traslocando. La prova
 * sta in `tests/unit/import-modelli.test.ts`.
 */
export function mapHeaders(
  headers: readonly string[],
  fields: readonly ImportField[],
): readonly HeaderMapping[] {
  return fields.map((field) => ({
    field: field.field,
    label: field.label,
    header: matchHeader(headers, [field.field, ...field.aliases, field.label]),
    required: field.required ?? false,
  }))
}

/** Costruisce il valore da validare per una riga del file. */
export function buildRowValues(
  row: Record<string, string>,
  fields: readonly ImportField[],
  mappings: readonly HeaderMapping[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  for (const field of fields) {
    const mapping = mappings.find((entry) => entry.field === field.field)
    if (!mapping?.header) continue
    const raw = row[mapping.header] ?? ''
    values[field.field] = field.transform ? field.transform(raw) : raw
  }

  // Secondo passaggio: i campi la cui colonna manca dal file prendono il
  // ripiego, che può dedurre dai valori appena letti.
  for (const field of fields) {
    if (field.fallback && !(field.field in values)) {
      values[field.field] = field.fallback(values)
    }
  }

  // Le caselle di consenso assenti nel file restano semplicemente non spuntate.
  return values
}

const STATI_PRATICA: Record<string, string> = {
  bozza: 'bozza',
  preventivo: 'bozza',
  opzione: 'opzione',
  opzionata: 'opzione',
  prenotata: 'confermata',
  confermata: 'confermata',
  confermato: 'confermata',
  annullata: 'annullata',
  annullato: 'annullata',
  cancellata: 'annullata',
  conclusa: 'conclusa',
  concluso: 'conclusa',
  chiusa: 'conclusa',
  partita: 'conclusa',
}

const VENDITE: Record<string, string> = {
  intermediazione: 'intermediazione',
  intermediata: 'intermediazione',
  commissione: 'intermediazione',
  biglietteria: 'intermediazione',
  organizzazione: 'organizzazione',
  organizzata: 'organizzazione',
  pacchetto: 'organizzazione',
  tour: 'organizzazione',
  terter: 'organizzazione',
}

/**
 * Le pratiche in arrivo da un altro gestionale.
 *
 * Il cliente arriva come testo e non come identificativo: nessun gestionale
 * esporta gli UUID di questo, e l'importazione lo risolve cercandolo in
 * anagrafica. Per questo l'ordine del trasloco e' prima i clienti, poi le
 * pratiche — ed e' scritto nella pagina.
 *
 * Lo stato e il tipo di vendita si traducono da un vocabolario largo: ogni
 * gestionale ha le sue parole per le stesse cose, e chiedere di rinominarle
 * a mano in un file di duemila righe significa non farsi scegliere.
 */
export const BOOKING_IMPORT_FIELDS: readonly ImportField[] = [
  {
    field: 'cliente',
    aliases: [
      'cliente', 'intestatario', 'nominativo', 'customer', 'ragione_sociale',
      'cognome_nome', 'cliente_email', 'email_cliente', 'partita_iva_cliente',
    ],
    label: 'Cliente',
    required: true,
  },
  {
    field: 'title',
    aliases: ['titolo', 'descrizione', 'pratica', 'viaggio', 'title'],
    label: 'Titolo',
    required: true,
  },
  {
    field: 'destination',
    aliases: ['destinazione', 'localita', 'meta', 'destination'],
    label: 'Destinazione',
    required: true,
  },
  { field: 'country', aliases: ['paese', 'nazione', 'country'], label: 'Paese' },
  {
    field: 'departure_date',
    aliases: ['partenza', 'data_partenza', 'dal', 'departure', 'departure_date'],
    label: 'Partenza',
    transform: asDate,
  },
  {
    field: 'return_date',
    aliases: ['rientro', 'ritorno', 'data_rientro', 'al', 'return', 'return_date'],
    label: 'Rientro',
    transform: asDate,
  },
  {
    field: 'pax_count',
    aliases: ['passeggeri', 'pax', 'numero_passeggeri', 'adulti'],
    label: 'Passeggeri',
    fallback: () => '1',
  },
  {
    field: 'sale_type',
    aliases: ['tipo_vendita', 'vendita', 'tipologia', 'sale_type'],
    label: 'Tipo di vendita',
    transform: (raw) => mapValue(VENDITE, raw, 'intermediazione'),
    // Senza la colonna: chi ha un costo di acquisto organizza, chi no
    // intermedia. E' la distinzione che conta per il 74-ter, e dedurla dai
    // numeri sbaglia meno che imporre un valore fisso.
    fallback: (values) => (isFilled(values.costo) ? 'organizzazione' : 'intermediazione'),
  },
  {
    field: 'status',
    aliases: ['stato', 'status', 'situazione'],
    label: 'Stato',
    transform: (raw) => mapValue(STATI_PRATICA, raw, 'confermata'),
    fallback: () => 'confermata',
  },
  {
    field: 'servizio',
    aliases: ['servizio', 'voce', 'service'],
    label: 'Servizio',
  },
  {
    field: 'importo',
    aliases: ['importo', 'prezzo', 'totale', 'venduto', 'ricavo', 'imponibile'],
    label: 'Importo',
  },
  {
    field: 'costo',
    aliases: ['costo', 'acquisto', 'costo_fornitore', 'netto'],
    label: 'Costo',
  },
  { field: 'notes', aliases: ['note', 'annotazioni', 'notes'], label: 'Note' },
]

const STATI_PREVENTIVO: Record<string, string> = {
  bozza: 'bozza',
  aperto: 'bozza',
  inviato: 'inviato',
  inviata: 'inviato',
  spedito: 'inviato',
  proposto: 'inviato',
  accettato: 'accettato',
  accettata: 'accettato',
  confermato: 'accettato',
  confermata: 'accettato',
  vinto: 'accettato',
  rifiutato: 'rifiutato',
  rifiutata: 'rifiutato',
  perso: 'rifiutato',
  annullato: 'rifiutato',
  scaduto: 'scaduto',
  scaduta: 'scaduto',
  // Un preventivo diventato pratica nel gestionale di prima arriva qui come
  // accettato: «convertito» è uno stato che solo questo gestionale assegna, e
  // lo assegna quando la conversione la fa lui.
  convertito: 'accettato',
  convertita: 'accettato',
}

/**
 * I preventivi in arrivo da un altro gestionale.
 *
 * Come per le pratiche il cliente arriva come testo. Il numero di origine,
 * quando c'è, si conserva nel riferimento: è la stringa con cui l'agenzia lo
 * cerca quando il cliente telefona citando il preventivo vecchio.
 */
export const QUOTE_IMPORT_FIELDS: readonly ImportField[] = [
  {
    field: 'cliente',
    aliases: [
      'cliente', 'intestatario', 'nominativo', 'customer', 'ragione_sociale',
      'cognome_nome', 'cliente_email', 'email_cliente',
    ],
    label: 'Cliente',
    required: true,
  },
  {
    field: 'title',
    aliases: ['titolo', 'descrizione', 'oggetto', 'viaggio', 'title'],
    label: 'Titolo',
    required: true,
  },
  {
    field: 'destination',
    aliases: ['destinazione', 'localita', 'meta', 'destination'],
    label: 'Destinazione',
    required: true,
  },
  {
    field: 'departure_date',
    aliases: ['partenza', 'data_partenza', 'dal', 'departure'],
    label: 'Partenza',
    transform: asDate,
  },
  {
    field: 'return_date',
    aliases: ['rientro', 'ritorno', 'data_rientro', 'al', 'return'],
    label: 'Rientro',
    transform: asDate,
  },
  {
    field: 'pax_count',
    aliases: ['passeggeri', 'pax', 'numero_passeggeri', 'adulti'],
    label: 'Passeggeri',
    fallback: () => '1',
  },
  {
    field: 'sale_type',
    aliases: ['tipo_vendita', 'vendita', 'tipologia', 'sale_type'],
    label: 'Tipo di vendita',
    transform: (raw) => mapValue(VENDITE, raw, 'intermediazione'),
    fallback: (values) => (isFilled(values.costo) ? 'organizzazione' : 'intermediazione'),
  },
  {
    field: 'status',
    aliases: ['stato', 'status', 'esito'],
    label: 'Stato',
    transform: (raw) => mapValue(STATI_PREVENTIVO, raw, 'inviato'),
    // Un preventivo importato è già stato mostrato a qualcuno: «bozza» direbbe
    // il falso, e nasconderebbe dall'elenco quello che l'agenzia sta seguendo.
    fallback: () => 'inviato',
  },
  {
    field: 'valid_until',
    aliases: ['validita', 'valido_fino', 'scadenza', 'valid_until'],
    label: 'Valido fino al',
    transform: asDate,
  },
  {
    field: 'riferimento',
    aliases: ['numero', 'numero_preventivo', 'codice', 'riferimento', 'protocollo'],
    label: 'Numero di origine',
  },
  { field: 'servizio', aliases: ['servizio', 'voce', 'service'], label: 'Servizio' },
  {
    field: 'importo',
    aliases: ['importo', 'prezzo', 'totale', 'venduto', 'quotazione'],
    label: 'Importo',
  },
  { field: 'costo', aliases: ['costo', 'acquisto', 'costo_fornitore', 'netto'], label: 'Costo' },
  { field: 'notes', aliases: ['note', 'annotazioni', 'notes'], label: 'Note' },
]

const TIPI_DOCUMENTO: Record<string, string> = {
  fattura: 'fattura',
  fattere: 'fattura',
  ft: 'fattura',
  fa: 'fattura',
  td: 'fattura',
  notadicredito: 'nota_credito',
  notacredito: 'nota_credito',
  nc: 'nota_credito',
  credito: 'nota_credito',
  reso: 'nota_credito',
  storno: 'nota_credito',
}

const STATI_DOCUMENTO: Record<string, string> = {
  emessa: 'emessa',
  emesso: 'emessa',
  aperta: 'emessa',
  daincassare: 'emessa',
  nonpagata: 'emessa',
  inviata: 'inviata',
  inviato: 'inviata',
  spedita: 'inviata',
  consegnata: 'inviata',
  pagata: 'pagata',
  pagato: 'pagata',
  incassata: 'pagata',
  saldata: 'pagata',
  chiusa: 'pagata',
  annullata: 'annullata',
  annullato: 'annullata',
  stornata: 'annullata',
}

const REGIMI_IVA: Record<string, string> = {
  ordinaria: 'ordinaria',
  ordinario: 'ordinaria',
  iva: 'ordinaria',
  imponibile: 'ordinaria',
  artter: 'art_74_ter',
  ter: 'art_74_ter',
  margine: 'art_74_ter',
  regimedelmargine: 'art_74_ter',
  esente: 'esente_art_10',
  esenteart: 'esente_art_10',
  escluso: 'fuori_campo',
  fuoricampo: 'fuori_campo',
  noniva: 'fuori_campo',
  reversecharge: 'reverse_charge',
  inversionecontabile: 'reverse_charge',
}

/**
 * I documenti già emessi dal gestionale di prima.
 *
 * Una riga del file è una riga del documento: più righe con lo stesso numero e
 * lo stesso anno fanno una fattura sola, con tutte le sue voci. È la forma in
 * cui i gestionali esportano il registro delle vendite, ed è anche la sola che
 * permette di importare una fattura con il dettaglio invece di un totale.
 *
 * Il numero è l'unico campo obbligatorio in più rispetto alle altre
 * importazioni, e lo è perché una fattura è il suo numero.
 */
export const INVOICE_IMPORT_FIELDS: readonly ImportField[] = [
  {
    field: 'number',
    aliases: ['numero', 'numero_documento', 'n_documento', 'num', 'number'],
    label: 'Numero',
    required: true,
  },
  {
    field: 'kind',
    aliases: ['tipo', 'tipo_documento', 'documento', 'kind'],
    label: 'Tipo di documento',
    transform: (raw) => mapValue(TIPI_DOCUMENTO, raw, 'fattura'),
    fallback: () => 'fattura',
  },
  {
    field: 'cliente',
    aliases: [
      'cliente', 'intestatario', 'nominativo', 'customer', 'ragione_sociale',
      'cognome_nome', 'cliente_email', 'email_cliente', 'partita_iva_cliente',
    ],
    label: 'Cliente',
    required: true,
  },
  {
    field: 'issue_date',
    aliases: ['data', 'data_documento', 'data_emissione', 'emissione', 'issue_date'],
    label: 'Data di emissione',
    required: true,
    transform: asDate,
  },
  {
    field: 'due_date',
    aliases: ['scadenza', 'data_scadenza', 'pagamento_entro', 'due_date'],
    label: 'Scadenza',
    transform: asDate,
  },
  {
    field: 'status',
    aliases: ['stato', 'status', 'pagata', 'incassata'],
    label: 'Stato',
    transform: (raw) => mapValue(STATI_DOCUMENTO, raw, 'emessa'),
    // Senza la colonna: emessa e non pagata. Dire «pagata» a un documento che
    // non lo è toglie soldi dallo scadenzario; il contrario li fa solo
    // ricomparire, e ricomparire si corregge in due clic.
    fallback: () => 'emessa',
  },
  {
    field: 'vat_regime',
    aliases: ['regime', 'regime_iva', 'natura', 'vat_regime'],
    label: 'Regime IVA',
    transform: (raw) => mapValue(REGIMI_IVA, raw, 'art_74_ter'),
    // Il 74-ter è il regime della quasi totalità dei documenti di un'agenzia di
    // viaggio, e il costo del viaggio nel file lo conferma.
    fallback: (values) => (isFilled(values.costo) ? 'art_74_ter' : 'ordinaria'),
  },
  {
    field: 'code',
    aliases: ['codice', 'protocollo', 'riferimento', 'numero_completo', 'code'],
    label: 'Codice',
  },
  {
    field: 'description',
    aliases: ['descrizione', 'servizio', 'voce', 'oggetto', 'description'],
    label: 'Descrizione',
    required: true,
  },
  { field: 'quantity', aliases: ['quantita', 'qta', 'quantity'], label: 'Quantità', fallback: () => '1' },
  {
    field: 'importo',
    aliases: ['importo', 'totale', 'prezzo', 'imponibile_lordo', 'totale_riga'],
    label: 'Importo',
    required: true,
  },
  {
    field: 'costo',
    aliases: ['costo', 'costo_viaggio', 'acquisto', 'netto'],
    label: 'Costo del viaggio',
  },
  {
    field: 'vat_percent',
    aliases: ['aliquota', 'aliquota_iva', 'iva', 'percentuale_iva'],
    label: 'Aliquota IVA',
    // Senza la colonna: 22%, che nel 74-ter è l'aliquota sul margine.
    fallback: () => '22',
  },
  { field: 'notes', aliases: ['note', 'annotazioni', 'notes'], label: 'Note' },
]
