import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { QUOTE_STATUS, QUOTE_VARIANT, SALE_TYPE } from '@/lib/labels'
import { parseListParams } from '@/lib/list-params'
import { allQuotesForExport } from '@/server/queries/preventivi'
import { requireSession } from '@/server/session'
import { QUOTE_LIST_OPTIONS } from '../config'

/** Importi in euro con la virgola: il file finisce in Excel italiano. */
const euro = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2).replace('.', ',')

/**
 * Esportazione dell'elenco preventivi con gli stessi filtri applicati a
 * schermo: ciò che si vede è ciò che si scarica. Il margine esce solo per chi
 * ha il permesso di vederlo a schermo, altrimenti il CSV sarebbe una scorciatoia
 * per aggirare il ruolo.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, QUOTE_LIST_OPTIONS)
  const rows = await allQuotesForExport(params)
  const date = new Date().toISOString().slice(0, 10)

  const csv = toCsv(rows, [
    { header: 'Numero', value: (row) => row.code },
    { header: 'Titolo', value: (row) => row.title },
    { header: 'Destinazione', value: (row) => row.destination },
    { header: 'Cliente', value: (row) => row.customer_name },
    { header: 'Email cliente', value: (row) => row.customer_email },
    { header: 'Operatore', value: (row) => row.owner_name },
    { header: 'Partenza', value: (row) => formatDateShort(row.departure_date) },
    { header: 'Rientro', value: (row) => formatDateShort(row.return_date) },
    { header: 'Passeggeri', value: (row) => row.pax_count ?? '' },
    {
      header: 'Stato',
      value: (row) =>
        row.is_expired
          ? QUOTE_STATUS.scaduto.label
          : row.status
            ? QUOTE_STATUS[row.status].label
            : '',
    },
    { header: 'Tipo di vendita', value: (row) => (row.sale_type ? SALE_TYPE[row.sale_type] : '') },
    { header: 'Valido fino al', value: (row) => formatDateShort(row.valid_until) },
    { header: 'Inviato il', value: (row) => formatDateShort(row.sent_at) },
    { header: 'Proposte', value: (row) => row.variants_count ?? 0 },
    {
      header: 'Proposta mostrata',
      value: (row) => (row.shown_variant ? QUOTE_VARIANT[row.shown_variant].label : ''),
    },
    { header: 'Importo', value: (row) => euro(row.revenue_cents) },
    ...(session.permissions.margins
      ? [{ header: 'Margine', value: (row: (typeof rows)[number]) => euro(row.margin_cents) }]
      : []),
    {
      header: 'Accettata',
      value: (row) => (row.accepted_variant ? QUOTE_VARIANT[row.accepted_variant].label : ''),
    },
    { header: 'Accettata da', value: (row) => row.accepted_by_name },
    { header: 'Accettata il', value: (row) => formatDateShort(row.accepted_at) },
    { header: 'Rifiutata il', value: (row) => formatDateShort(row.rejected_at) },
    { header: 'Motivo del rifiuto', value: (row) => row.rejection_reason },
    { header: 'Pratica', value: (row) => row.booking_code },
  ])

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="preventivi-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
