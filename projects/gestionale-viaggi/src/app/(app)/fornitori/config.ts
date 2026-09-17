import type { ParseListParamsOptions } from '@/lib/list-params'

export const SUPPLIER_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'name',
    'kind',
    'city',
    'payment_terms_days',
    'services_count',
    'cost_cents',
    'margin_cents',
    'margin_bps',
    'open_payable_cents',
    'next_due_date',
    'created_at',
  ],
  defaultSort: 'name',
  defaultDirection: 'asc',
  filterKeys: ['tipo', 'attivo', 'scaduti'],
}
