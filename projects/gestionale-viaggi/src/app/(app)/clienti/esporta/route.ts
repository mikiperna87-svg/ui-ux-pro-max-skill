import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { parseListParams } from '@/lib/list-params'
import { allCustomersForExport } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { CUSTOMER_LIST_OPTIONS } from '../config'

/**
 * Esportazione dell'elenco clienti con gli stessi filtri applicati a schermo:
 * ciò che si vede è ciò che si scarica.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, CUSTOMER_LIST_OPTIONS)
  const rows = await allCustomersForExport(params)

  const csv = toCsv(rows, [
    { header: 'Tipo', value: (row) => (row.kind === 'azienda' ? 'Azienda' : 'Privato') },
    { header: 'Denominazione', value: (row) => row.display_name },
    { header: 'Cognome', value: (row) => row.last_name },
    { header: 'Nome', value: (row) => row.first_name },
    { header: 'Ragione sociale', value: (row) => row.company_name },
    { header: 'Partita IVA', value: (row) => row.vat_number },
    { header: 'Codice fiscale', value: (row) => row.tax_code },
    { header: 'Email', value: (row) => row.email },
    { header: 'Telefono', value: (row) => row.phone },
    { header: 'Cellulare', value: (row) => row.mobile },
    { header: 'Città', value: (row) => row.city },
    { header: 'Provincia', value: (row) => row.province },
    { header: 'Tag', value: (row) => (row.tags ?? []).join(', ') },
    { header: 'Consenso marketing', value: (row) => (row.marketing_consent ? 'Sì' : 'No') },
    { header: 'Pratiche', value: (row) => row.bookings_count },
    // Gli importi in euro con la virgola: il file è destinato a Excel italiano.
    {
      header: 'Valore generato',
      value: (row) => ((row.lifetime_value_cents ?? 0) / 100).toFixed(2).replace('.', ','),
    },
    {
      header: 'Margine generato',
      value: (row) =>
        session.permissions.margins
          ? ((row.lifetime_margin_cents ?? 0) / 100).toFixed(2).replace('.', ',')
          : '',
    },
    {
      header: 'Da incassare',
      value: (row) => ((row.open_balance_cents ?? 0) / 100).toFixed(2).replace('.', ','),
    },
    { header: 'Ultima partenza', value: (row) => formatDateShort(row.last_departure) },
    { header: 'Prossima partenza', value: (row) => formatDateShort(row.next_departure) },
  ])

  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="clienti-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
