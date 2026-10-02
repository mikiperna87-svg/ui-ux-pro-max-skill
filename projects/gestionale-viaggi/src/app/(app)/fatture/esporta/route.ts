import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import { INVOICE_KIND, INVOICE_PAYMENT_STATE, INVOICE_STATUS, VAT_REGIME, isInvoicePaymentState } from '@/lib/labels'
import { parseListParams } from '@/lib/list-params'
import { allInvoicesForExport } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'
import { INVOICE_LIST_OPTIONS } from '../config'

const euro = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2).replace('.', ',')

/**
 * Il file che si manda al commercialista: gli stessi documenti che si vedono a
 * schermo, con imponibile, imposta e regime di ciascuno. Le note di credito
 * portano il loro segno nella colonna «Totale con segno», che è quella che si
 * somma.
 */
export async function GET(request: NextRequest) {
  await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const params = parseListParams(raw, INVOICE_LIST_OPTIONS)
  const rows = await allInvoicesForExport(params)
  const date = new Date().toISOString().slice(0, 10)

  const csv = toCsv(rows, [
    { header: 'Numero', value: (row) => row.code ?? '' },
    { header: 'Tipo', value: (row) => (row.kind ? INVOICE_KIND[row.kind] : '') },
    { header: 'Data', value: (row) => formatDateShort(row.issue_date) },
    { header: 'Scadenza', value: (row) => formatDateShort(row.due_date) },
    { header: 'Cliente', value: (row) => row.customer_name },
    { header: 'Partita IVA', value: (row) => row.customer_vat },
    { header: 'Pratica', value: (row) => row.booking_code },
    { header: 'Regime IVA', value: (row) => (row.vat_regime ? VAT_REGIME[row.vat_regime].label : '') },
    { header: 'Imponibile', value: (row) => euro(row.taxable_cents) },
    { header: 'IVA', value: (row) => euro(row.vat_cents) },
    { header: 'Totale', value: (row) => euro(row.total_cents) },
    { header: 'Totale con segno', value: (row) => euro(row.signed_total_cents) },
    { header: 'Stato', value: (row) => (row.status ? INVOICE_STATUS[row.status].label : '') },
    {
      header: 'Incasso',
      value: (row) =>
        isInvoicePaymentState(row.payment_state)
          ? INVOICE_PAYMENT_STATE[row.payment_state].label
          : '',
    },
    { header: 'Incassato', value: (row) => euro(row.paid_cents) },
    { header: 'Residuo', value: (row) => euro(row.residual_cents) },
    { header: 'Giorni di ritardo', value: (row) => (row.is_overdue ? (row.days_late ?? 0) : 0) },
    { header: 'Storna la fattura', value: (row) => row.credit_note_of_code },
  ])

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="fatture-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
