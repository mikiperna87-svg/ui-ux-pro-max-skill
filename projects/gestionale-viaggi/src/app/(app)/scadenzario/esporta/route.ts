import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { formatDateShort } from '@/lib/date'
import {
  INSTALLMENT_KIND,
  INSTALLMENT_STATE,
  PAYMENT_METHOD,
  PAYOUT_STATUS,
  isInstallmentState,
} from '@/lib/labels'
import { parseListParams } from '@/lib/list-params'
import { listInstallments, listPayouts } from '@/server/queries/incassi'
import { requireSession } from '@/server/session'
import { INSTALLMENT_LIST_OPTIONS, PAYOUT_LIST_OPTIONS, sezioneDa } from '../config'

/** Gli importi in euro con la virgola: il file è destinato a Excel italiano. */
const euro = (cents: number | null | undefined) => ((cents ?? 0) / 100).toFixed(2).replace('.', ',')

/**
 * Esportazione dello scadenzario con gli stessi filtri applicati a schermo, per
 * la scheda che si sta guardando: ciò che si vede è ciò che si scarica.
 */
export async function GET(request: NextRequest) {
  await requireSession()
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const sezione = sezioneDa(raw.sezione)
  const date = new Date().toISOString().slice(0, 10)

  const csv =
    sezione === 'incassi' ? await csvIncassi(raw) : await csvPagamenti(raw)

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="scadenzario-${sezione}-${date}.csv"`,
      'cache-control': 'no-store',
    },
  })
}

async function csvIncassi(raw: Record<string, string>): Promise<string> {
  const params = parseListParams(raw, INSTALLMENT_LIST_OPTIONS)
  const { rows } = await listInstallments({ ...params, page: 1, perPage: 5000 })

  return toCsv(rows, [
    { header: 'Scadenza', value: (row) => formatDateShort(row.due_date) },
    { header: 'Pratica', value: (row) => row.booking_code },
    { header: 'Cliente', value: (row) => row.customer_name },
    { header: 'Destinazione', value: (row) => row.destination },
    { header: 'Partenza', value: (row) => formatDateShort(row.departure_date) },
    { header: 'Tipo', value: (row) => (row.kind ? INSTALLMENT_KIND[row.kind] : '') },
    { header: 'Importo', value: (row) => euro(row.amount_cents) },
    { header: 'Incassato', value: (row) => euro(row.covered_cents) },
    { header: 'Residuo', value: (row) => euro(row.residual_cents) },
    {
      header: 'Stato',
      value: (row) => (isInstallmentState(row.state) ? INSTALLMENT_STATE[row.state].label : ''),
    },
    { header: 'Giorni di ritardo', value: (row) => (row.is_late ? (row.days_late ?? 0) : 0) },
    { header: 'Email cliente', value: (row) => row.customer_email },
    { header: 'Telefono cliente', value: (row) => row.customer_phone },
  ])
}

async function csvPagamenti(raw: Record<string, string>): Promise<string> {
  const params = parseListParams(raw, PAYOUT_LIST_OPTIONS)
  const { rows } = await listPayouts({ ...params, page: 1, perPage: 5000 })

  return toCsv(rows, [
    { header: 'Scadenza', value: (row) => formatDateShort(row.due_date) },
    { header: 'Fornitore', value: (row) => row.supplier_name },
    { header: 'Pratica', value: (row) => row.booking_code },
    { header: 'Servizio', value: (row) => row.service_description },
    { header: 'Importo', value: (row) => euro(row.amount_cents) },
    { header: 'Stato', value: (row) => (row.status ? PAYOUT_STATUS[row.status].label : '') },
    { header: 'Pagato il', value: (row) => formatDateShort(row.paid_at) },
    { header: 'Metodo', value: (row) => (row.method ? PAYMENT_METHOD[row.method] : '') },
    { header: 'Fattura fornitore', value: (row) => row.supplier_invoice_number },
    { header: 'Riferimento', value: (row) => row.reference },
    { header: 'IBAN', value: (row) => row.supplier_iban },
    { header: 'Giorni di ritardo', value: (row) => (row.is_late ? (row.days_late ?? 0) : 0) },
  ])
}
