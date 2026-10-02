import { MapPin } from 'lucide-react'
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
import { nomePaese, plurale } from '@/lib/labels'
import { formatEuro, formatPercent, ratioBps } from '@/lib/money'
import { somma, type DestinationRow } from '@/server/queries/report'
import { LIMITE_DESTINAZIONI } from './config'

/**
 * Venduto per destinazione.
 *
 * Accanto al venduto c'è la quota sul totale del periodo: senza, un numero
 * grande non dice se quella meta pesa il trenta per cento o il tre. La barra
 * ha sempre la percentuale scritta di fianco — un disegno non è un dato.
 */
export function VistaDestinazioni({
  rows,
  mostraMargini,
}: {
  rows: readonly DestinationRow[]
  mostraMargini: boolean
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<MapPin />}
        title="Nessuna destinazione nel periodo"
        description="Nessuna partenza fra le date scelte: prova un periodo più ampio."
      />
    )
  }

  const totali = {
    pratiche: somma(rows, (row) => row.bookingsCount),
    pax: somma(rows, (row) => row.paxCount),
    venduto: somma(rows, (row) => row.revenueCents),
    margine: somma(rows, (row) => row.marginCents),
  }

  const quota = (cents: number) => (totali.venduto === 0 ? 0 : ratioBps(cents, totali.venduto))

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>Destinazioni</CardTitle>
          {rows.length >= LIMITE_DESTINAZIONI ? (
            <p className="text-caption text-text-muted">
              Le prime {LIMITE_DESTINAZIONI} per venduto. Restringi il periodo per vedere le altre.
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrapper label="Risultati per destinazione" className="hidden rounded-none border-0 shadow-none md:block">
          <Table>
            <caption className="sr-only">
              Venduto, quota e margine per destinazione nel periodo scelto
            </caption>
            <TableHead>
              <tr>
                <TableHeaderCell>Destinazione</TableHeaderCell>
                <TableHeaderCell className="text-right">Pratiche</TableHeaderCell>
                <TableHeaderCell className="text-right">Passeggeri</TableHeaderCell>
                <TableHeaderCell className="text-right">Clienti</TableHeaderCell>
                <TableHeaderCell className="text-right">Venduto</TableHeaderCell>
                <TableHeaderCell className="w-48">Quota sul venduto</TableHeaderCell>
                <TableHeaderCell className="text-right">Ticket medio</TableHeaderCell>
                {mostraMargini ? (
                  <>
                    <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                    <TableHeaderCell className="text-right">Margine %</TableHeaderCell>
                  </>
                ) : null}
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.destination}>
                  <TableCell>
                    <p className="font-medium text-text">{row.destination}</p>
                    {row.country ? (
                      <p className="text-caption text-text-muted">{nomePaese(row.country)}</p>
                    ) : null}
                  </TableCell>
                  <TableCellNumeric>{row.bookingsCount}</TableCellNumeric>
                  <TableCellNumeric>{row.paxCount}</TableCellNumeric>
                  <TableCellNumeric className="text-text-muted">
                    {row.customersCount}
                  </TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {formatEuro(row.revenueCents)}
                  </TableCellNumeric>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 min-w-px flex-1 overflow-hidden rounded-full bg-surface-2"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(quota(row.revenueCents) / 100, 1)}%` }}
                        />
                      </span>
                      <span className="num w-12 shrink-0 text-right text-caption text-text-muted">
                        {formatPercent(quota(row.revenueCents), 1)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCellNumeric className="text-text-muted">
                    {formatEuro(row.averageTicketCents)}
                  </TableCellNumeric>
                  {mostraMargini ? (
                    <>
                      <TableCellNumeric>{formatEuro(row.marginCents)}</TableCellNumeric>
                      <TableCellNumeric className="text-text-muted">
                        {formatPercent(row.marginBps)}
                      </TableCellNumeric>
                    </>
                  ) : null}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium text-text">Totale</TableCell>
                <TableCellNumeric className="font-medium">{totali.pratiche}</TableCellNumeric>
                <TableCellNumeric className="font-medium">{totali.pax}</TableCellNumeric>
                <TableCell />
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.venduto)}
                </TableCellNumeric>
                <TableCell />
                <TableCellNumeric className="font-medium">
                  {formatEuro(
                    totali.pratiche === 0 ? 0 : Math.round(totali.venduto / totali.pratiche),
                  )}
                </TableCellNumeric>
                {mostraMargini ? (
                  <>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(totali.margine)}
                    </TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatPercent(ratioBps(totali.margine, totali.venduto))}
                    </TableCellNumeric>
                  </>
                ) : null}
              </TableRow>
            </TableBody>
          </Table>
        </TableWrapper>

        <ul className="divide-y divide-border md:hidden">
          {rows.map((row) => (
            <li key={row.destination} className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{row.destination}</p>
                  {row.country ? (
                    <p className="text-caption text-text-muted">{nomePaese(row.country)}</p>
                  ) : null}
                </div>
                <p className="num shrink-0 font-medium text-text">
                  {formatEuro(row.revenueCents)}
                </p>
              </div>
              <p className="num text-caption text-text-muted">
                {formatPercent(quota(row.revenueCents), 1)} del venduto ·{' '}
                {plurale(row.bookingsCount, 'pratica', 'pratiche')} · {row.paxCount} pax
              </p>
              {mostraMargini ? (
                <p className="num text-caption text-text-muted">
                  margine {formatEuro(row.marginCents)} ({formatPercent(row.marginBps)})
                </p>
              ) : null}
            </li>
          ))}
          <li className="flex items-center justify-between gap-2 bg-surface-2 p-4">
            <p className="font-medium text-text">Totale</p>
            <p className="num font-medium text-text">{formatEuro(totali.venduto)}</p>
          </li>
        </ul>
      </CardContent>
    </Card>
  )
}
