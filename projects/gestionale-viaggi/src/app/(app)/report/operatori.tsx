import { FileText, UserRound } from 'lucide-react'
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
import { plurale } from '@/lib/labels'
import { formatEuro, formatPercent, ratioBps } from '@/lib/money'
import { somma, type OwnerRow, type QuoteOwnerRow } from '@/server/queries/report'

/**
 * Rendimento per operatore.
 *
 * La riga dei totali non è un numero calcolato altrove: è la somma esatta di
 * ciò che la tabella mostra, così chi controlla con la calcolatrice trova lo
 * stesso risultato. Il margine percentuale del totale si ricalcola sul venduto
 * complessivo, perché la media delle percentuali non è la percentuale della
 * somma.
 */
export function VistaOperatori({
  rows,
  quotes,
  mostraMargini,
}: {
  rows: readonly OwnerRow[]
  quotes: readonly QuoteOwnerRow[]
  mostraMargini: boolean
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<UserRound />}
        title="Nessuna pratica nel periodo"
        description="Nessuna partenza fra le date scelte. Cambia periodo, oppure registra le pratiche con la loro data di partenza."
      />
    )
  }

  const totali = {
    pratiche: somma(rows, (row) => row.bookingsCount),
    pax: somma(rows, (row) => row.paxCount),
    venduto: somma(rows, (row) => row.revenueCents),
    margine: somma(rows, (row) => row.marginCents),
    incassato: somma(rows, (row) => row.collectedCents),
    residuo: somma(rows, (row) => row.balanceCents),
    annullate: somma(rows, (row) => row.cancelledCount),
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pratiche per operatore</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
            <Table>
              <caption className="sr-only">
                Venduto, margine e incassato per operatore nel periodo scelto
              </caption>
              <TableHead>
                <tr>
                  <TableHeaderCell>Operatore</TableHeaderCell>
                  <TableHeaderCell className="text-right">Pratiche</TableHeaderCell>
                  <TableHeaderCell className="text-right">Passeggeri</TableHeaderCell>
                  <TableHeaderCell className="text-right">Venduto</TableHeaderCell>
                  <TableHeaderCell className="text-right">Ticket medio</TableHeaderCell>
                  {mostraMargini ? (
                    <>
                      <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                      <TableHeaderCell className="text-right">Margine %</TableHeaderCell>
                    </>
                  ) : null}
                  <TableHeaderCell className="text-right">Incassato</TableHeaderCell>
                  <TableHeaderCell className="text-right">Residuo</TableHeaderCell>
                  <TableHeaderCell className="text-right">Annullate</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.ownerId ?? 'nessuno'}>
                    <TableCell className="font-medium text-text">{row.ownerName}</TableCell>
                    <TableCellNumeric>{row.bookingsCount}</TableCellNumeric>
                    <TableCellNumeric>{row.paxCount}</TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(row.revenueCents)}
                    </TableCellNumeric>
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
                    <TableCellNumeric className="text-text-muted">
                      {formatEuro(row.collectedCents)}
                    </TableCellNumeric>
                    <TableCellNumeric
                      className={row.balanceCents > 0 ? 'text-text' : 'text-text-muted'}
                    >
                      {formatEuro(row.balanceCents)}
                    </TableCellNumeric>
                    <TableCellNumeric className="text-text-muted">
                      {row.cancelledCount === 0 ? '—' : row.cancelledCount}
                    </TableCellNumeric>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium text-text">Totale</TableCell>
                  <TableCellNumeric className="font-medium">{totali.pratiche}</TableCellNumeric>
                  <TableCellNumeric className="font-medium">{totali.pax}</TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {formatEuro(totali.venduto)}
                  </TableCellNumeric>
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
                  <TableCellNumeric className="font-medium">
                    {formatEuro(totali.incassato)}
                  </TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {formatEuro(totali.residuo)}
                  </TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {totali.annullate === 0 ? '—' : totali.annullate}
                  </TableCellNumeric>
                </TableRow>
              </TableBody>
            </Table>
          </TableWrapper>

          {/* Dieci colonne su 390 px non si leggono: una scheda per operatore,
              con sotto il numero grande le tre cifre che servono davvero. */}
          <ul className="divide-y divide-border md:hidden">
            {rows.map((row) => (
              <li key={row.ownerId ?? 'nessuno'} className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-text">{row.ownerName}</p>
                  <p className="num shrink-0 font-medium text-text">
                    {formatEuro(row.revenueCents)}
                  </p>
                </div>
                <p className="num text-caption text-text-muted">
                  {plurale(row.bookingsCount, 'pratica', 'pratiche')} · {row.paxCount} pax · ticket{' '}
                  {formatEuro(row.averageTicketCents)}
                </p>
                {mostraMargini ? (
                  <p className="num text-caption text-text-muted">
                    margine {formatEuro(row.marginCents)} ({formatPercent(row.marginBps)})
                  </p>
                ) : null}
                <p className="num text-caption text-text-muted">
                  incassato {formatEuro(row.collectedCents)} · residuo{' '}
                  {formatEuro(row.balanceCents)}
                  {row.cancelledCount > 0
                    ? ` · ${plurale(row.cancelledCount, 'annullata', 'annullate')}`
                    : ''}
                </p>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 bg-surface-2 p-4">
              <p className="font-medium text-text">Totale</p>
              <p className="num font-medium text-text">{formatEuro(totali.venduto)}</p>
            </li>
          </ul>
        </CardContent>
      </Card>

      <VistaPreventivi rows={quotes} />
    </div>
  )
}

/**
 * Preventivi e conversione.
 *
 * Sta in una scheda separata, e non fra le colonne della tabella sopra, perché
 * si conta su un altro asse: i preventivi entrano per data di creazione, le
 * pratiche per data di partenza. Metterli sulla stessa riga inviterebbe a
 * sommare due cose che non si sommano.
 */
function VistaPreventivi({ rows }: { rows: readonly QuoteOwnerRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preventivi creati nel periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<FileText />}
            title="Nessun preventivo creato nel periodo"
            description="Qui compare quanti preventivi sono stati scritti, quanti inviati e quanti hanno portato a una pratica."
          />
        </CardContent>
      </Card>
    )
  }

  const totali = {
    creati: somma(rows, (row) => row.quotesCount),
    inviati: somma(rows, (row) => row.sentCount),
    accettati: somma(rows, (row) => row.acceptedCount),
    convertiti: somma(rows, (row) => row.convertedCount),
    valore: somma(rows, (row) => row.acceptedCents),
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>Preventivi creati nel periodo</CardTitle>
          <p className="text-caption text-text-muted">
            Contati per data di creazione, non di partenza. La conversione è calcolata sugli
            inviati: una bozza non è mai stata un’offerta.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
          <Table>
            <caption className="sr-only">Preventivi per operatore, con esito e conversione</caption>
            <TableHead>
              <tr>
                <TableHeaderCell>Operatore</TableHeaderCell>
                <TableHeaderCell className="text-right">Creati</TableHeaderCell>
                <TableHeaderCell className="text-right">Inviati</TableHeaderCell>
                <TableHeaderCell className="text-right">Accettati</TableHeaderCell>
                <TableHeaderCell className="text-right">Rifiutati</TableHeaderCell>
                <TableHeaderCell className="text-right">Convertiti</TableHeaderCell>
                <TableHeaderCell className="text-right">Conversione</TableHeaderCell>
                <TableHeaderCell className="text-right">Valore accettato</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.ownerId ?? 'nessuno'}>
                  <TableCell className="font-medium text-text">{row.ownerName}</TableCell>
                  <TableCellNumeric>{row.quotesCount}</TableCellNumeric>
                  <TableCellNumeric>{row.sentCount}</TableCellNumeric>
                  <TableCellNumeric>{row.acceptedCount}</TableCellNumeric>
                  <TableCellNumeric className="text-text-muted">
                    {row.rejectedCount === 0 ? '—' : row.rejectedCount}
                  </TableCellNumeric>
                  <TableCellNumeric>{row.convertedCount}</TableCellNumeric>
                  <TableCellNumeric className="font-medium">
                    {row.sentCount === 0 ? '—' : formatPercent(row.conversionBps, 0)}
                  </TableCellNumeric>
                  <TableCellNumeric>{formatEuro(row.acceptedCents)}</TableCellNumeric>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium text-text">Totale</TableCell>
                <TableCellNumeric className="font-medium">{totali.creati}</TableCellNumeric>
                <TableCellNumeric className="font-medium">{totali.inviati}</TableCellNumeric>
                <TableCellNumeric className="font-medium">{totali.accettati}</TableCellNumeric>
                <TableCell />
                <TableCellNumeric className="font-medium">{totali.convertiti}</TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {totali.inviati === 0
                    ? '—'
                    : formatPercent(ratioBps(totali.accettati, totali.inviati), 0)}
                </TableCellNumeric>
                <TableCellNumeric className="font-medium">
                  {formatEuro(totali.valore)}
                </TableCellNumeric>
              </TableRow>
            </TableBody>
          </Table>
        </TableWrapper>

        <ul className="divide-y divide-border md:hidden">
          {rows.map((row) => (
            <li key={row.ownerId ?? 'nessuno'} className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-text">{row.ownerName}</p>
                <p className="num shrink-0 font-medium text-text">
                  {row.sentCount === 0 ? '—' : formatPercent(row.conversionBps, 0)}
                </p>
              </div>
              <p className="num text-caption text-text-muted">
                {row.quotesCount} creati · {row.sentCount} inviati · {row.acceptedCount} accettati ·{' '}
                {row.convertedCount} convertiti
              </p>
              <p className="num text-caption text-text-muted">
                valore accettato {formatEuro(row.acceptedCents)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
