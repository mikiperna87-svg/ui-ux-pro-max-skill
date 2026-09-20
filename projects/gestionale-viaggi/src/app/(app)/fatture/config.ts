import type { ParseListParamsOptions } from '@/lib/list-params'

/**
 * Configurazione dell'elenco dei documenti fiscali, condivisa fra la pagina,
 * l'esportazione e le viste salvate.
 */
export const INVOICE_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: [
    'code',
    'issue_date',
    'due_date',
    'customer_name',
    'total_cents',
    'residual_cents',
  ],
  defaultSort: 'issue_date',
  defaultDirection: 'desc',
  filterKeys: ['tipo', 'stato', 'pagamento', 'cliente', 'anno', 'da', 'a'],
}
