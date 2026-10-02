'use client'

import { Receipt } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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
import { useToast } from '@/components/ui/toast'
import { formatDateShort } from '@/lib/date'
import type { Enums, Tables } from '@/lib/database.types'
import { INVOICE_KIND, INVOICE_STATUS } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { invoiceFromBookingAction } from '@/server/actions/fatture'

/**
 * Le fatture della pratica, con il comando che ne apre una nuova.
 *
 * Che cosa si fattura dipende dal tipo di vendita: chi organizza il viaggio
 * fattura i servizi in regime 74-ter, chi intermedia fattura la propria
 * provvigione con IVA ordinaria. La scelta è già fatta dalla pratica, e la
 * conferma la dice a parole invece di lasciarla implicita.
 */
export function FatturePratica({
  bookingId,
  saleType,
  invoices,
  canManage,
  canInvoice,
}: {
  bookingId: string
  saleType: Enums['sale_type']
  invoices: readonly Tables<'invoices'>[]
  canManage: boolean
  canInvoice: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const organizzazione = saleType === 'organizzazione'

  function creaFattura() {
    startTransition(async () => {
      const esito = await invoiceFromBookingAction(
        bookingId,
        organizzazione ? 'servizi' : 'commissione',
      )
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Bozza di fattura aperta.')
        const id = esito.values?.id
        if (id) router.push(`/fatture/${id}`)
        else router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti ad aprire la fattura.')
      }
    })
  }

  const comando =
    canManage && canInvoice ? (
      <ConfirmDialog
        trigger={
          <Button variant="primary" size="sm">
            <Receipt aria-hidden="true" />
            Fattura questa pratica
          </Button>
        }
        title="Aprire una bozza di fattura?"
        description={
          organizzazione
            ? 'Le righe di servizio diventano le righe della fattura, in regime art. 74-ter: l’IVA si calcola sul margine. La bozza non prende ancora un numero.'
            : 'Viene creata una riga con la provvigione dell’agenzia, con IVA ordinaria. La bozza non prende ancora un numero.'
        }
        confirmLabel="Apri la bozza"
        onConfirm={creaFattura}
      />
    ) : null

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <CardTitle>Fatture</CardTitle>
          {/* Quando non c'è nulla il comando sta nello stato vuoto, dove ha
              accanto la frase che spiega che cosa farà: ripeterlo anche qui
              sarebbe lo stesso bottone due volte nella stessa scheda. */}
          {invoices.length > 0 ? comando : null}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {invoices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Receipt />}
              title="Nessuna fattura per questa pratica"
              description={
                canInvoice
                  ? 'La bozza nasce dalle righe già inserite: la controlli, la correggi e poi la emetti.'
                  : 'Si fattura una pratica confermata.'
              }
              action={comando ?? undefined}
            />
          </div>
        ) : (
          <>
            <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
              <Table>
                <caption className="sr-only">Fatture della pratica</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Numero</TableHeaderCell>
                    <TableHeaderCell>Data</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                    <TableHeaderCell className="text-right">Imponibile</TableHeaderCell>
                    <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                    <TableHeaderCell className="text-right">Totale</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {invoices.map((fattura) => (
                    <TableRow key={fattura.id}>
                      <TableCell>
                        <Link
                          href={`/fatture/${fattura.id}`}
                          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                        >
                          {fattura.code ?? 'Bozza'}
                        </Link>
                        {fattura.kind === 'nota_credito' ? (
                          <p className="text-caption text-text-muted">
                            {INVOICE_KIND.nota_credito}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="num">
                        {fattura.status === 'bozza' ? '—' : formatDateShort(fattura.issue_date)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={INVOICE_STATUS[fattura.status].tone} dot>
                          {INVOICE_STATUS[fattura.status].label}
                        </Badge>
                      </TableCell>
                      <TableCellNumeric>{formatEuro(fattura.taxable_cents)}</TableCellNumeric>
                      <TableCellNumeric>{formatEuro(fattura.vat_cents)}</TableCellNumeric>
                      <TableCellNumeric className="font-medium">
                        {fattura.kind === 'nota_credito' ? '− ' : ''}
                        {formatEuro(fattura.total_cents)}
                      </TableCellNumeric>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>

            <ul className="divide-y divide-border md:hidden">
              {invoices.map((fattura) => (
                <li key={fattura.id}>
                  <Link href={`/fatture/${fattura.id}`} className="block space-y-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="num min-w-0 truncate font-medium text-text">
                        {fattura.code ?? 'Bozza'}
                      </p>
                      <p className="num shrink-0 font-medium text-text">
                        {fattura.kind === 'nota_credito' ? '− ' : ''}
                        {formatEuro(fattura.total_cents)}
                      </p>
                    </div>
                    <p className="num text-caption text-text-muted">
                      imponibile {formatEuro(fattura.taxable_cents)} · IVA{' '}
                      {formatEuro(fattura.vat_cents)}
                    </p>
                    <Badge tone={INVOICE_STATUS[fattura.status].tone} dot>
                      {INVOICE_STATUS[fattura.status].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
