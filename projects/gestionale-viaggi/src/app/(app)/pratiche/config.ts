import type { ParseListParamsOptions } from '@/lib/list-params'

/**
 * Configurazione dell'elenco pratiche, condivisa fra la pagina, l'esportazione
 * e le viste salvate: filtri e ordinamenti ammessi si dichiarano una volta sola.
 */
export const BOOKING_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'code',
    'customer_name',
    'destination',
    'departure_date',
    'return_date',
    'pax_count',
    'revenue_cents',
    'margin_cents',
    'balance_cents',
    'created_at',
  ],
  defaultSort: 'departure_date',
  defaultDirection: 'desc',
  filterKeys: ['stato', 'pagamento', 'tipo', 'operatore', 'periodo', 'cliente'],
}
