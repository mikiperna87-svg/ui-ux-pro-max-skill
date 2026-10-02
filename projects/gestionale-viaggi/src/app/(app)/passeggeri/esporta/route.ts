import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { parseListParams } from '@/lib/list-params'
import { allPassengersForExport } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { PASSENGER_LIST_OPTIONS, documentStateInfo } from '../config'

export async function GET(request: NextRequest) {
  await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, PASSENGER_LIST_OPTIONS)
  const rows = await allPassengersForExport(params)

  const csv = toCsv(rows, [
    { header: 'Cognome', value: (row) => row.last_name },
    { header: 'Nome', value: (row) => row.first_name },
    { header: 'Cliente', value: (row) => row.customer_name },
    { header: 'Data di nascita', value: (row) => formatDateShort(row.birth_date) },
    { header: 'Nazionalità', value: (row) => row.nationality },
    { header: 'Email', value: (row) => row.email },
    { header: 'Telefono', value: (row) => row.phone },
    { header: 'Tipo documento', value: (row) => row.document_type },
    { header: 'Numero documento', value: (row) => row.document_number },
    { header: 'Scadenza', value: (row) => formatDateShort(row.document_expires_at) },
    { header: 'Stato documento', value: (row) => documentStateInfo(row.document_state).label },
    { header: 'Esigenze alimentari', value: (row) => row.dietary_needs },
    { header: 'Esigenze particolari', value: (row) => row.special_needs },
    { header: 'Viaggi', value: (row) => row.bookings_count },
  ])

  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="passeggeri-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
