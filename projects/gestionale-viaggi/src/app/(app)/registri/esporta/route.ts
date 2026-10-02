import type { NextRequest } from 'next/server'
import { toCsv } from '@/lib/csv'
import { INVOICE_KIND, VAT_REGIME, nomeMese } from '@/lib/labels'
import { vatRegister, type RegisterRow } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

/**
 * Il registro IVA in un file: è ciò che si manda al commercialista per la
 * liquidazione. Una riga per mese, tipo di documento, regime e aliquota, con
 * l'ultima riga di totale.
 */
export async function GET(request: NextRequest) {
  await requireSession()

  const richiesto = Number(request.nextUrl.searchParams.get('anno'))
  const anno =
    Number.isInteger(richiesto) && richiesto >= 2000 && richiesto <= 2100
      ? richiesto
      : new Date().getFullYear()

  const registro = await vatRegister(anno)

  const righe: RegisterRow[] = [...registro.rows]
  const csv = toCsv(righe, [
    { header: 'Anno', value: () => anno },
    { header: 'Mese', value: (row) => nomeMese(row.month) },
    { header: 'Numero mese', value: (row) => row.month },
    { header: 'Tipo', value: (row) => INVOICE_KIND[row.kind] },
    { header: 'Regime IVA', value: (row) => VAT_REGIME[row.vat_regime].label },
    { header: 'Aliquota', value: (row) => `${(row.vat_bps / 100).toFixed(2).replace('.', ',')}%` },
    { header: 'Documenti', value: (row) => row.documents_count },
    { header: 'Margine', value: (row) => euro(row.margin_cents) },
    { header: 'Imponibile', value: (row) => euro(row.taxable_cents) },
    { header: 'IVA', value: (row) => euro(row.vat_cents) },
    { header: 'Totale', value: (row) => euro(row.total_cents) },
  ])

  const totale = toCsv(
    [registro.totals],
    [
      { header: 'Anno', value: () => anno },
      { header: 'Mese', value: () => 'Totale' },
      { header: 'Numero mese', value: () => '' },
      { header: 'Tipo', value: () => '' },
      { header: 'Regime IVA', value: () => '' },
      { header: 'Aliquota', value: () => '' },
      { header: 'Documenti', value: (row) => row.documenti },
      { header: 'Margine', value: (row) => euro(row.margine) },
      { header: 'Imponibile', value: (row) => euro(row.imponibile) },
      { header: 'IVA', value: (row) => euro(row.iva) },
      { header: 'Totale', value: (row) => euro(row.totale) },
    ],
    { bom: false },
  )
    // La riga di intestazione del secondo blocco non serve: si tiene solo il totale.
    .split('\r\n')
    .slice(1)
    .join('\r\n')

  return new Response(`${csv}${totale}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="registro-iva-${anno}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
