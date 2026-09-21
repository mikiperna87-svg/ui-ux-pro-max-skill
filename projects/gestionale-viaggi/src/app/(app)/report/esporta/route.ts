import type { NextRequest } from 'next/server'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { SUPPLIER_KIND, nomePaese } from '@/lib/labels'
import { dataValida, risolviPeriodo } from '@/lib/report-period'
import {
  reportByDestination,
  reportByOwner,
  reportBySupplier,
  reportQuotesByOwner,
  type DestinationRow,
  type OwnerRow,
  type QuoteOwnerRow,
  type SupplierRow,
} from '@/server/queries/report'
import { requireSession } from '@/server/session'
import { LIMITE_DESTINAZIONI, vistaDa } from '../config'

/** Gli importi in un foglio di calcolo italiano: 1234,56 senza simbolo. */
const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
const percento = (bps: number) => `${(bps / 100).toFixed(2).replace('.', ',')}%`

/**
 * Il report del periodo in un file.
 *
 * Esporta la vista che si sta guardando, con lo stesso periodo e le stesse
 * righe: un file che non corrisponde a ciò che c'era a schermo è peggio di
 * nessun file. Le colonne di margine seguono il permesso di chi scarica,
 * perché un'esportazione è una lettura come le altre.
 */
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const params = request.nextUrl.searchParams

  const periodo = risolviPeriodo({
    da: dataValida(params.get('da') ?? undefined) ?? undefined,
    a: dataValida(params.get('a') ?? undefined) ?? undefined,
    periodo: params.get('periodo') ?? undefined,
  })
  const vista = vistaDa(params.get('vista') ?? undefined, session.permissions.margins)
  const margini = session.permissions.margins

  const { nome, csv } = await contenuto(vista, periodo.from, periodo.to, margini)

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="report-${nome}-${periodo.from}_${periodo.to}.csv"`,
      'cache-control': 'no-store',
    },
  })
}

async function contenuto(
  vista: 'operatori' | 'destinazioni' | 'fornitori',
  from: string,
  to: string,
  margini: boolean,
): Promise<{ nome: string; csv: string }> {
  if (vista === 'destinazioni') {
    const rows = await reportByDestination(from, to, LIMITE_DESTINAZIONI)
    const colonne: CsvColumn<DestinationRow>[] = [
      { header: 'Destinazione', value: (row) => row.destination },
      { header: 'Paese', value: (row) => nomePaese(row.country) },
      { header: 'Pratiche', value: (row) => row.bookingsCount },
      { header: 'Passeggeri', value: (row) => row.paxCount },
      { header: 'Clienti', value: (row) => row.customersCount },
      { header: 'Venduto', value: (row) => euro(row.revenueCents) },
      { header: 'Ticket medio', value: (row) => euro(row.averageTicketCents) },
    ]
    if (margini) {
      colonne.push(
        { header: 'Costo', value: (row) => euro(row.costCents) },
        { header: 'Margine', value: (row) => euro(row.marginCents) },
        { header: 'Margine %', value: (row) => percento(row.marginBps) },
      )
    }
    return { nome: 'destinazioni', csv: toCsv(rows, colonne) }
  }

  if (vista === 'fornitori') {
    const rows = await reportBySupplier(from, to)
    const colonne: CsvColumn<SupplierRow>[] = [
      { header: 'Fornitore', value: (row) => row.supplierName },
      { header: 'Tipo', value: (row) => SUPPLIER_KIND[row.kind] },
      { header: 'Righe di servizio', value: (row) => row.servicesCount },
      { header: 'Pratiche', value: (row) => row.bookingsCount },
      { header: 'Acquistato', value: (row) => euro(row.costCents) },
      { header: 'Venduto', value: (row) => euro(row.revenueCents) },
      { header: 'Commissioni', value: (row) => euro(row.commissionCents) },
      { header: 'Margine', value: (row) => euro(row.marginCents) },
      { header: 'Margine %', value: (row) => percento(row.marginBps) },
      { header: 'Da pagare', value: (row) => euro(row.dueCents) },
      { header: 'Pagato', value: (row) => euro(row.paidCents) },
    ]
    return { nome: 'fornitori', csv: toCsv(rows, colonne) }
  }

  const [rows, quotes] = await Promise.all([
    reportByOwner(from, to),
    reportQuotesByOwner(from, to),
  ])

  const colonne: CsvColumn<OwnerRow>[] = [
    { header: 'Operatore', value: (row) => row.ownerName },
    { header: 'Pratiche', value: (row) => row.bookingsCount },
    { header: 'Passeggeri', value: (row) => row.paxCount },
    { header: 'Venduto', value: (row) => euro(row.revenueCents) },
    { header: 'Ticket medio', value: (row) => euro(row.averageTicketCents) },
  ]
  if (margini) {
    colonne.push(
      { header: 'Costo', value: (row) => euro(row.costCents) },
      { header: 'Commissioni', value: (row) => euro(row.commissionCents) },
      { header: 'Margine', value: (row) => euro(row.marginCents) },
      { header: 'Margine %', value: (row) => percento(row.marginBps) },
    )
  }
  colonne.push(
    { header: 'Incassato', value: (row) => euro(row.collectedCents) },
    { header: 'Residuo', value: (row) => euro(row.balanceCents) },
    { header: 'Annullate', value: (row) => row.cancelledCount },
  )

  const colonnePreventivi: CsvColumn<QuoteOwnerRow>[] = [
    { header: 'Operatore', value: (row) => row.ownerName },
    { header: 'Preventivi creati', value: (row) => row.quotesCount },
    { header: 'Inviati', value: (row) => row.sentCount },
    { header: 'Accettati', value: (row) => row.acceptedCount },
    { header: 'Rifiutati', value: (row) => row.rejectedCount },
    { header: 'Convertiti', value: (row) => row.convertedCount },
    { header: 'Conversione', value: (row) => percento(row.conversionBps) },
    { header: 'Valore accettato', value: (row) => euro(row.acceptedCents) },
  ]

  // Due blocchi nello stesso file, separati da una riga vuota: i preventivi si
  // contano per data di creazione e non per partenza, e mescolarli alle
  // pratiche in un'unica tabella inviterebbe a sommare cose diverse.
  const csv =
    toCsv(rows, colonne) +
    '\r\n' +
    toCsv(quotes, colonnePreventivi, { bom: false })

  return { nome: 'operatori', csv }
}
