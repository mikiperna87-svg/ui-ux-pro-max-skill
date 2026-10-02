import type { ZodType } from 'zod'
import { toCsv } from '@/lib/csv'
import {
  BOOKING_IMPORT_FIELDS,
  CUSTOMER_IMPORT_FIELDS,
  INVOICE_IMPORT_FIELDS,
  PASSENGER_IMPORT_FIELDS,
  QUOTE_IMPORT_FIELDS,
  SUPPLIER_IMPORT_FIELDS,
  type ImportField,
} from '@/lib/import-maps'
import { customerSchema, passengerSchema, supplierSchema } from '@/lib/validation/anagrafiche'
import { legacyInvoiceImportSchema } from '@/lib/validation/fatture'
import { bookingImportSchema, quoteImportSchema } from '@/lib/validation/pratiche'

export type ImportEntity =
  | 'clienti'
  | 'passeggeri'
  | 'fornitori'
  | 'pratiche'
  | 'preventivi'
  | 'fatture'

export interface ImportDefinition {
  readonly fields: readonly ImportField[]
  readonly schema: ZodType
  readonly listHref: string
  readonly templateHref: string
  /** Nome del file che l'utente scarica. */
  readonly templateFile: string
  /**
   * Righe di esempio del modello scaricabile, scritte per etichetta di colonna.
   *
   * Stanno qui e non nella rotta che le serve perché il modello deve potersi
   * reimportare: un esempio che il nostro stesso lettore scarta è la prima cosa
   * che chi prova il gestionale incontra. La prova sta in
   * `tests/unit/import-modelli.test.ts`, che il modello lo genera e lo rilegge.
   */
  readonly examples: readonly Record<string, string>[]
  /** Etichetta con cui la riga compare nell'anteprima. */
  readonly labelFor: (values: Record<string, unknown>) => string
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Registro delle importazioni.
 *
 * Vive fuori dalle pagine perché schemi e funzioni non possono attraversare il
 * confine fra Server e Client Component: la pagina passa il nome dell'entità,
 * il componente di importazione risolve qui tutto il resto.
 */
export const IMPORT_DEFINITIONS: Record<ImportEntity, ImportDefinition> = {
  clienti: {
    fields: CUSTOMER_IMPORT_FIELDS,
    schema: customerSchema,
    listHref: '/clienti',
    templateHref: '/clienti/modello',
    templateFile: 'modello-clienti.csv',
    examples: [
      {
        Tipo: 'Privato',
        Cognome: 'Rossi',
        Nome: 'Mario',
        'Codice fiscale': 'RSSMRA85T10A562S',
        Email: 'mario.rossi@example.it',
        Telefono: '0332 123456',
        Cellulare: '335 1234567',
        Indirizzo: 'Via Roma 1',
        CAP: '21100',
        Città: 'Varese',
        Provincia: 'VA',
        'Data di nascita': '10/12/1985',
        'Luogo di nascita': 'Varese',
        Tag: 'vip, famiglia',
        'Consenso privacy': 'Sì',
        'Consenso marketing': 'No',
      },
      {
        Tipo: 'Azienda',
        'Ragione sociale': 'Lombardi Impianti S.r.l.',
        'Partita IVA': '02114560150',
        Email: 'amministrazione@lombardiimpianti.it',
        Telefono: '02 4455 6677',
        Indirizzo: 'Via Torino 12',
        CAP: '20123',
        Città: 'Milano',
        Provincia: 'MI',
        'Consenso privacy': 'Sì',
        'Consenso marketing': 'No',
      },
    ],
    labelFor: (values) =>
      [text(values.company_name), text(values.last_name), text(values.first_name)]
        .filter((value) => value !== '')
        .join(' '),
  },
  passeggeri: {
    fields: PASSENGER_IMPORT_FIELDS,
    schema: passengerSchema,
    listHref: '/passeggeri',
    templateHref: '/passeggeri/modello',
    templateFile: 'modello-passeggeri.csv',
    examples: [
      {
        Cognome: 'Verdi',
        Nome: 'Anna',
        'Data di nascita': '22/05/1990',
        'Luogo di nascita': 'Milano',
        Sesso: 'F',
        Nazionalità: 'IT',
        Email: 'anna.verdi@example.it',
        Telefono: '335 7654321',
        'Tipo documento': 'Passaporto',
        'Numero documento': 'YA1234567',
        Rilascio: '01/03/2020',
        Scadenza: '01/03/2030',
        'Rilasciato da': 'Questura di Milano',
        'Esigenze alimentari': 'Intollerante al lattosio',
      },
    ],
    labelFor: (values) =>
      [text(values.last_name), text(values.first_name)].filter((value) => value !== '').join(' '),
  },
  fornitori: {
    fields: SUPPLIER_IMPORT_FIELDS,
    schema: supplierSchema,
    listHref: '/fornitori',
    templateHref: '/fornitori/modello',
    templateFile: 'modello-fornitori.csv',
    examples: [
      {
        Nome: 'Mediterranea Tour',
        Tipo: 'Tour operator',
        'Ragione sociale': 'Mediterranea Tour S.p.A.',
        'Partita IVA': '02114560150',
        Email: 'booking@mediterraneatour.it',
        Telefono: '02 4455 1100',
        Referente: 'Elena Colombo',
        Indirizzo: 'Via Torino 12',
        CAP: '20123',
        Città: 'Milano',
        Provincia: 'MI',
        IBAN: 'IT95A0300203280000400551122',
        'Giorni di pagamento': '30',
        'Commissione %': '12',
        'Regime IVA': 'Margine',
        Attivo: 'Sì',
      },
    ],
    labelFor: (values) => text(values.name),
  },
  pratiche: {
    fields: BOOKING_IMPORT_FIELDS,
    schema: bookingImportSchema,
    listHref: '/pratiche',
    templateHref: '/pratiche/modello',
    templateFile: 'modello-pratiche.csv',
    // Due righe e non una: la prima mostra una pratica organizzata con costo e
    // ricavo, la seconda un'intermediazione dove il costo non c'è. Sono i due
    // casi che cambiano il regime IVA, e vederli accanto evita la domanda.
    examples: [
      {
        Cliente: 'mario.rossi@example.it',
        Titolo: 'Capodanno a Lisbona',
        Destinazione: 'Lisbona',
        Paese: 'Portogallo',
        Partenza: '29/12/2026',
        Rientro: '02/01/2027',
        Passeggeri: '2',
        'Tipo di vendita': 'Organizzazione',
        Stato: 'Confermata',
        Servizio: 'Volo + hotel 4 notti',
        Importo: '1.840,00',
        Costo: '1.420,00',
      },
      {
        Cliente: 'Lombardi Impianti S.r.l.',
        Titolo: 'Biglietteria Malpensa–Catania',
        Destinazione: 'Catania',
        Paese: 'Italia',
        Partenza: '14/03/2027',
        Passeggeri: '1',
        'Tipo di vendita': 'Intermediazione',
        Stato: 'Confermata',
        Servizio: 'Biglietto aereo',
        Importo: '180,00',
        Note: 'Commissione 12%',
      },
    ],
    labelFor: (values) =>
      [text(values.title), text(values.cliente)].filter((value) => value !== '').join(' · '),
  },
  fatture: {
    fields: INVOICE_IMPORT_FIELDS,
    schema: legacyInvoiceImportSchema,
    listHref: '/fatture',
    templateHref: '/fatture/modello',
    templateFile: 'modello-fatture.csv',
    // Tre righe per due documenti: la prima fattura ha due voci con lo stesso
    // numero, e vederle accanto spiega il raggruppamento meglio di una nota.
    examples: [
      {
        Numero: '417',
        'Tipo di documento': 'Fattura',
        Cliente: 'mario.rossi@example.it',
        'Data di emissione': '14/11/2025',
        Scadenza: '14/12/2025',
        Stato: 'Pagata',
        'Regime IVA': 'Margine',
        Codice: 'FT-2025/0417',
        Descrizione: 'Pacchetto Lisbona, volo e hotel',
        Quantità: '1',
        Importo: '1.840,00',
        'Costo del viaggio': '1.420,00',
        'Aliquota IVA': '22',
      },
      {
        Numero: '417',
        'Tipo di documento': 'Fattura',
        Cliente: 'mario.rossi@example.it',
        'Data di emissione': '14/11/2025',
        Scadenza: '14/12/2025',
        Stato: 'Pagata',
        'Regime IVA': 'Margine',
        Codice: 'FT-2025/0417',
        Descrizione: 'Assicurazione annullamento',
        Quantità: '2',
        Importo: '45,00',
        'Costo del viaggio': '30,00',
        'Aliquota IVA': '22',
      },
      {
        Numero: '418',
        'Tipo di documento': 'Fattura',
        Cliente: 'Lombardi Impianti S.r.l.',
        'Data di emissione': '20/11/2025',
        Scadenza: '20/12/2025',
        Stato: 'Emessa',
        'Regime IVA': 'Ordinaria',
        Codice: 'FT-2025/0418',
        Descrizione: 'Provvigione biglietteria aerea',
        Quantità: '1',
        Importo: '122,00',
        'Aliquota IVA': '22',
        Note: 'Trasferte novembre',
      },
    ],
    labelFor: (values) =>
      [text(values.code) || text(values.number), text(values.cliente)]
        .filter((value) => value !== '')
        .join(' · '),
  },
  preventivi: {
    fields: QUOTE_IMPORT_FIELDS,
    schema: quoteImportSchema,
    listHref: '/preventivi',
    templateHref: '/preventivi/modello',
    templateFile: 'modello-preventivi.csv',
    examples: [
      {
        Cliente: 'mario.rossi@example.it',
        Titolo: 'Capodanno a Lisbona',
        Destinazione: 'Lisbona',
        Partenza: '29/12/2026',
        Rientro: '02/01/2027',
        Passeggeri: '2',
        'Tipo di vendita': 'Organizzazione',
        Stato: 'Inviato',
        'Valido fino al': '30/11/2026',
        'Numero di origine': 'PREV-2026-114',
        Servizio: 'Volo + hotel 4 notti',
        Importo: '1.840,00',
        Costo: '1.420,00',
      },
      {
        Cliente: 'Lombardi Impianti S.r.l.',
        Titolo: 'Weekend a Vienna',
        Destinazione: 'Vienna',
        Partenza: '14/03/2027',
        Rientro: '16/03/2027',
        Passeggeri: '2',
        'Tipo di vendita': 'Intermediazione',
        Stato: 'Accettato',
        'Numero di origine': 'PREV-2026-118',
        Servizio: 'Hotel 2 notti',
        Importo: '420,00',
        Note: 'Commissione 10%',
      },
    ],
    labelFor: (values) =>
      [text(values.title), text(values.cliente)].filter((value) => value !== '').join(' · '),
  },
}

/**
 * Il modello scaricabile di un'entità: intestazioni e righe di esempio.
 *
 * Una funzione sola per tutte le rotte `/<entità>/modello`: il file che l'utente
 * scarica e il file che l'importazione rilegge sono generati dalla stessa
 * definizione, e non possono divergere.
 */
export function templateCsv(entity: ImportEntity): string {
  const definizione = IMPORT_DEFINITIONS[entity]
  return toCsv(
    definizione.examples,
    definizione.fields.map((field) => ({
      header: field.label,
      value: (riga: Record<string, string>) => riga[field.label] ?? '',
    })),
  )
}
