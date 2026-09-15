import type { ZodType } from 'zod'
import {
  CUSTOMER_IMPORT_FIELDS,
  PASSENGER_IMPORT_FIELDS,
  SUPPLIER_IMPORT_FIELDS,
  type ImportField,
} from '@/lib/import-maps'
import { customerSchema, passengerSchema, supplierSchema } from '@/lib/validation/anagrafiche'

export type ImportEntity = 'clienti' | 'passeggeri' | 'fornitori'

export interface ImportDefinition {
  readonly fields: readonly ImportField[]
  readonly schema: ZodType
  readonly listHref: string
  readonly templateHref: string
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
    labelFor: (values) =>
      [text(values.last_name), text(values.first_name)].filter((value) => value !== '').join(' '),
  },
  fornitori: {
    fields: SUPPLIER_IMPORT_FIELDS,
    schema: supplierSchema,
    listHref: '/fornitori',
    templateHref: '/fornitori/modello',
    labelFor: (values) => text(values.name),
  },
}
