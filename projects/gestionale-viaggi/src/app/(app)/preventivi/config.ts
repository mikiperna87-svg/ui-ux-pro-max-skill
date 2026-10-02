import type { ParseListParamsOptions } from '@/lib/list-params'

/**
 * Configurazione dell'elenco preventivi, condivisa fra la pagina,
 * l'esportazione e le viste salvate.
 */
export const QUOTE_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'code',
    'customer_name',
    'destination',
    'departure_date',
    'valid_until',
    'revenue_cents',
    'created_at',
  ],
  defaultSort: 'created_at',
  defaultDirection: 'desc',
  filterKeys: ['stato', 'validita', 'operatore', 'cliente'],
}
