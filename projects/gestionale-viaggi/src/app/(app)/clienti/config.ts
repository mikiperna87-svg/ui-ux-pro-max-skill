import type { ParseListParamsOptions } from '@/lib/list-params'

/**
 * Configurazione dell'elenco clienti, condivisa fra la pagina e le rotte di
 * esportazione: filtri e ordinamenti ammessi si dichiarano una volta sola.
 */
export const CUSTOMER_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'display_name',
    'city',
    'created_at',
    'bookings_count',
    'lifetime_value_cents',
    'lifetime_margin_cents',
    'open_balance_cents',
    'last_departure',
    'next_departure',
  ],
  defaultSort: 'display_name',
  defaultDirection: 'asc',
  filterKeys: ['tipo', 'tag', 'consenso', 'attivita'],
}
