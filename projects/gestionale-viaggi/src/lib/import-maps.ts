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

/** Associa le intestazioni del file ai campi previsti. */
export function mapHeaders(
  headers: readonly string[],
  fields: readonly ImportField[],
): readonly HeaderMapping[] {
  return fields.map((field) => ({
    field: field.field,
    label: field.label,
    header: matchHeader(headers, [field.field, ...field.aliases]),
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
