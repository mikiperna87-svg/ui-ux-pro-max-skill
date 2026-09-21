import { Truck } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableCellNumeric,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { SUPPLIER_KIND, plurale } from '@/lib/labels'
import { formatEuro, formatPercent, ratioBps } from '@/lib/money'
import { somma, type SupplierRow } from '@/server/queries/report'

/**
 * Acquistato e margine per fornitore.
 *
 * Il venduto attribuito qui è quello delle righe comprate da quel fornitore,
 * non della pratica intera: una pratica con il volo di uno e l'albergo di un
 * altro pesa su entrambi, ciascuno per la sua parte. Sommare la colonna
 * "venduto" di questa tabella non dà quindi il venduto dell'agenzia, e il
 * totale lo dice invece di lasciarlo scoprire.
 */
export function VistaFornitori({ rows }: { rows: readonly SupplierRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Truck />}
        title="Nessun acquisto nel periodo"
        description="Nessuna riga di servizio con fornitore sulle pratiche in partenza fra le date scelte."
      />
    )
  }

  const totali = {
    pratiche: somma(rows, (row) => row.bookingsCount),
    acquistato: somma(rows, (row) => row.costCents),
    venduto: somma(rows, (row) => row.revenueCents),
    commissioni: somma(rows, (row) => row.commissionCents),
    margine: somma(rows, (row) => row.marginCents),
    daPagare: somma(rows, (row) => row.dueCents),
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>Fornitori</CardTitle>
          <p className="text-caption text-text-muted">
            Ogni riga conta solo i servizi comprati da quel fornitore: il venduto è la sua parte di
            pratica, non la pratica intera.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
          <Table>
            <caption className="sr-only">
              Acquistato, margine generato e pagamenti per fornitore nel periodo scelto
            </caption>
            <TableHead>
              <tr>
                <TableHeaderCell>Fornitore</TableHeaderCell>
                <TableHeaderCell className="text-right">Pratiche</TableHeaderCell>
                <TableHeaderCell className="text-right">Acquistato</TableHeaderCell>
                <TableHeaderCell className="text-right">Venduto</TableHeaderCell>
                <TableHeaderCell className="text-right">Commissioni</TableHeaderCell>
                <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                <TableHeaderCell className="text-right">Margine %</TableHeaderCell>
                <TableHeaderCell className="text-right">Da pagare</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.supplierId}>
                  <TableCell>
                    <Link
                      href={`/fornitori/${row.supplierId}`}
                      className="font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                    >
                      {row.supplierName}
                    </Link>
                    <p className="text-caption text-text-muted">
                      {SUPPLIER_KIND[row.kind]} · {plurale(row.servicesCount, 'riga', 'righe')}
                    </p>
                  </TableCell>
                  <TableCellNumeric>{row.bookingsCount}</TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {formatEuro(row.costCents)}
                  </TableCellNumeric>
                  <TableCellNumeric className="text-text-muted">
                    {formatEuro(row.revenueCents)}
                  </TableCellNumeric>
                  <TableCellNumeric className="text-text-muted">
                    {row.commissionCents === 0 ? '—' : formatEuro(row.commissionCents)}
                  </TableCellNumeric>
                  <TableCellNumeric>{formatEuro(row.marginCents)}</TableCellNumeric>
                  <TableCellNumeric className="text-text-muted">
                    {formatPercent(row.marginBps)}
                  </TableCellNumeric>
                  <TableCellNumeric className={row.dueCents > 0 ? 'text-text' : 'text-text-muted'}>
                    {row.dueCents === 0 ? '—' : formatEuro(row.dueCents)}
                  </TableCellNumeric>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium text-text">Totale</TableCell>
                <TableCell />
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.acquistato)}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.venduto)}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.commissioni)}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.margine)}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatPercent(ratioBps(totali.margine, totali.venduto))}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.daPagare)}
                </TableCellNumeric>
              </TableRow>
            </TableBody>
          </Table>
        </TableWrapper>

        <ul className="divide-y divide-border md:hidden">
          {rows.map((row) => (
            <li key={row.supplierId}>
              <Link href={`/fornitori/${row.supplierId}`} className="block space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text">{row.supplierName}</p>
                    <p className="text-caption text-text-muted">{SUPPLIER_KIND[row.kind]}</p>
                  </div>
                  <p className="num shrink-0 font-medium text-text">
                    {formatEuro(row.costCents)}
                  </p>
                </div>
                <p className="num text-caption text-text-muted">
                  venduto {formatEuro(row.revenueCents)} · margine {formatEuro(row.marginCents)} (
                  {formatPercent(row.marginBps)})
                </p>
                <p className="num text-caption text-text-muted">
                  {row.dueCents === 0
                    ? 'niente da pagare'
                    : `da pagare ${formatEuro(row.dueCents)}`}{' '}
                  · {plurale(row.bookingsCount, 'pratica', 'pratiche')}
                </p>
              </Link>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2 bg-surface-2 p-4">
            <p className="font-medium text-text">Totale acquistato</p>
            <p className="num font-medium text-text">{formatEuro(totali.acquistato)}</p>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
