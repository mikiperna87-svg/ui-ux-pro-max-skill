import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { BOOKING_STATUS, PAYMENT_STATE } from '@/lib/labels'
import { parseListParams } from '@/lib/list-params'
import { allBookingsForExport } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { BOOKING_LIST_OPTIONS } from '../config'

/** Gli importi in euro con la virgola: il file è destinato a Excel italiano. */
const euro = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2).replace('.', ',')

/**
 * Esportazione dell'elenco pratiche con gli stessi filtri applicati a schermo:
 * ciò che si vede è ciò che si scarica.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, BOOKING_LIST_OPTIONS)
  const rows = await allBookingsForExport(params)

  const csv = toCsv(rows, [
    { header: 'Pratica', value: (row) => row.code },
    { header: 'Cliente', value: (row) => row.customer_name },
    { header: 'Titolo', value: (row) => row.title },
    { header: 'Destinazione', value: (row) => row.destination },
    { header: 'Partenza', value: (row) => formatDateShort(row.departure_date) },
    { header: 'Rientro', value: (row) => formatDateShort(row.return_date) },
    { header: 'Passeggeri', value: (row) => row.pax_count },
    { header: 'Stato', value: (row) => (row.status ? BOOKING_STATUS[row.status].label : '') },
    {
      header: 'Tipo di vendita',
      value: (row) => (row.sale_type === 'organizzazione' ? 'Organizzazione' : 'Intermediazione'),
    },
    { header: 'Operatore', value: (row) => row.owner_name },
    { header: 'Venduto', value: (row) => euro(row.revenue_cents) },
    { header: 'Costo', value: (row) => (session.permissions.margins ? euro(row.cost_cents) : '') },
    {
      header: 'Commissioni',
      value: (row) => (session.permissions.margins ? euro(row.commission_cents) : ''),
    },
    { header: 'Margine', value: (row) => (session.permissions.margins ? euro(row.margin_cents) : '') },
    { header: 'Incassato', value: (row) => euro(row.paid_cents) },
    { header: 'Da incassare', value: (row) => euro(row.balance_cents) },
    { header: 'Da pagare ai fornitori', value: (row) => euro(row.supplier_due_cents) },
    { header: 'Prossima scadenza', value: (row) => formatDateShort(row.next_due_date) },
    {
      header: 'Stato pagamento',
      value: (row) => (row.payment_state ? PAYMENT_STATE[row.payment_state].label : ''),
    },
  ])

  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="pratiche-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
