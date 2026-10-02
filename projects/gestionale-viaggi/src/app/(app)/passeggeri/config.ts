import type { ParseListParamsOptions } from '@/lib/list-params'

export const PASSENGER_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'full_name',
    'birth_date',
    'document_expires_at',
    'customer_name',
    'bookings_count',
    'created_at',
  ],
  defaultSort: 'full_name',
  defaultDirection: 'asc',
  filterKeys: ['documento', 'tipo_documento', 'cliente'],
}

export interface DocumentStateInfo {
  readonly value: string
  readonly label: string
  readonly tone: 'success' | 'warning' | 'danger' | 'neutral'
}

/** Stati del documento, con l'etichetta e il tono con cui compaiono. */
export const DOCUMENT_STATES: readonly DocumentStateInfo[] = [
  { value: 'valido', label: 'Valido', tone: 'success' },
  { value: 'in_scadenza', label: 'In scadenza', tone: 'warning' },
  { value: 'insufficiente', label: 'Scade prima del rientro', tone: 'danger' },
  { value: 'scaduto', label: 'Scaduto', tone: 'danger' },
  { value: 'assente', label: 'Assente', tone: 'neutral' },
]

const UNKNOWN_DOCUMENT: DocumentStateInfo = { value: 'assente', label: 'Assente', tone: 'neutral' }

export function documentStateInfo(state: string | null): DocumentStateInfo {
  return DOCUMENT_STATES.find((entry) => entry.value === state) ?? UNKNOWN_DOCUMENT
}
