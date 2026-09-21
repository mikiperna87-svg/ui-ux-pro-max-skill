import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { parseListParams } from '@/lib/list-params'
import { SUPPLIER_KIND, VAT_REGIME } from '@/lib/labels'
import { allSuppliersForExport } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { SUPPLIER_LIST_OPTIONS } from '../config'

export async function GET(request: NextRequest) {
  const session = await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, SUPPLIER_LIST_OPTIONS)
  const rows = await allSuppliersForExport(params)

  const euro = (cents: number | null) => ((cents ?? 0) / 100).toFixed(2).replace('.', ',')

  const csv = toCsv(rows, [
    { header: 'Nome', value: (row) => row.name },
    { header: 'Tipo', value: (row) => (row.kind ? SUPPLIER_KIND[row.kind] : '') },
    { header: 'Ragione sociale', value: (row) => row.legal_name },
    { header: 'Partita IVA', value: (row) => row.vat_number },
    { header: 'Referente', value: (row) => row.contact_name },
    { header: 'Email', value: (row) => row.email },
    { header: 'Telefono', value: (row) => row.phone },
    { header: 'Città', value: (row) => row.city },
    { header: 'Provincia', value: (row) => row.province },
    { header: 'IBAN', value: (row) => row.iban },
    { header: 'Giorni pagamento', value: (row) => row.payment_terms_days },
    {
      header: 'Commissione %',
      value: (row) => ((row.default_commission_bps ?? 0) / 100).toFixed(2).replace('.', ','),
    },
    {
      header: 'Regime IVA',
      value: (row) => (row.default_vat_regime ? VAT_REGIME[row.default_vat_regime].label : ''),
    },
    { header: 'Attivo', value: (row) => (row.is_active ? 'Sì' : 'No') },
    { header: 'Servizi', value: (row) => row.services_count },
    { header: 'Acquistato', value: (row) => euro(row.cost_cents) },
    {
      header: 'Margine generato',
      value: (row) => (session.permissions.margins ? euro(row.margin_cents) : ''),
    },
    { header: 'Da pagare', value: (row) => euro(row.open_payable_cents) },
    { header: 'Scaduto', value: (row) => euro(row.overdue_payable_cents) },
    { header: 'Prossima scadenza', value: (row) => formatDateShort(row.next_due_date) },
  ])

  const date = new Date().toISOString().slice(0, 10)
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="fornitori-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
