import type { ParseListParamsOptions } from '@/lib/list-params'

/**
 * Configurazione delle due griglie dello scadenzario, condivisa fra la pagina,
 * l'esportazione e le viste salvate.
 *
 * Le due schede vivono nello stesso indirizzo e leggono gli stessi parametri:
 * `sezione` decide quale delle due si guarda, tutto il resto (ricerca, filtri,
 * ordinamento, pagina) vale per entrambe. Un solo stato nell'indirizzo, quindi
 * un collegamento allo scadenzario in ritardo resta un collegamento solo.
 */
export const SEZIONI = ['incassi', 'pagamenti'] as const
export type Sezione = (typeof SEZIONI)[number]

export function sezioneDa(value: string | string[] | undefined): Sezione {
  const primo = Array.isArray(value) ? value[0] : value
  return primo === 'pagamenti' ? 'pagamenti' : 'incassi'
}

export const INSTALLMENT_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: ['due_date', 'amount_cents', 'residual_cents', 'booking_code', 'customer_name'],
  defaultSort: 'due_date',
  defaultDirection: 'asc',
  filterKeys: ['stato', 'quando', 'operatore', 'cliente', 'pratica', 'sezione'],
}

export const PAYOUT_LIST_OPTIONS: ParseListParamsOptions = {
  sortable: ['due_date', 'amount_cents', 'supplier_name', 'booking_code'],
  defaultSort: 'due_date',
  defaultDirection: 'asc',
  filterKeys: ['stato', 'quando', 'fornitore', 'pratica', 'sezione'],
}
