import { IdCard, Pencil, Plane } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { BookingStatusBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { formatDateRange, formatDateShort, formatRelativeDays } from '@/lib/date'
import { getPassengerDetail } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { documentStateInfo } from '../config'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getPassengerDetail(id)
  return { title: detail?.passenger.full_name ?? 'Passeggero' }
}

const DOCUMENT_LABELS: Record<string, string> = {
  passaporto: 'Passaporto',
  carta_identita: 'Carta d’identità',
  patente: 'Patente',
  permesso_soggiorno: 'Permesso di soggiorno',
}

export default async function PasseggeroPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const detail = await getPassengerDetail(id)

  if (!detail) notFound()

  const { passenger, documentState, customer, bookings } = detail
  const info = documentStateInfo(documentState?.document_state ?? null)

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={passenger.full_name ?? 'Passeggero'}
        description={[
          passenger.birth_date ? `Nato il ${formatDateShort(passenger.birth_date)}` : null,
          passenger.birth_place,
          customer ? `Cliente: ${customer.display_name}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/passeggeri">Torna all’elenco</Link>
            </Button>
            {session.permissions.write ? (
              <Button asChild variant="primary" size="sm">
                <Link href={`/passeggeri/${passenger.id}/modifica`}>
                  <Pencil aria-hidden="true" />
                  Modifica
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {info.value !== 'valido' ? (
        <p
          role="status"
          className={
            info.tone === 'danger'
              ? 'rounded-lg border border-danger-subtle bg-danger-subtle/50 px-3 py-2 text-small text-danger-fg'
              : 'rounded-lg border border-warning-subtle bg-warning-subtle/50 px-3 py-2 text-small text-warning-fg'
          }
        >
          <strong className="font-semibold">{info.label}.</strong>{' '}
          {info.value === 'assente'
            ? 'Nessun documento registrato: serve prima della conferma di una pratica.'
            : info.value === 'insufficiente'
              ? `Il documento scade il ${formatDateShort(
                  passenger.document_expires_at,
                )}, prima del rientro previsto il ${formatDateShort(documentState?.next_return_date)}.`
              : `Scadenza: ${formatDateShort(passenger.document_expires_at)} (${formatRelativeDays(
                  passenger.document_expires_at,
                )}).`}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Anagrafica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Riga label="Nome completo">{passenger.full_name}</Riga>
            <Riga label="Nato il">{formatDateShort(passenger.birth_date)}</Riga>
            <Riga label="Luogo di nascita">{passenger.birth_place}</Riga>
            <Riga label="Nazionalità">{passenger.nationality}</Riga>
            <Riga label="Codice fiscale">
              {passenger.tax_code ? <span className="num">{passenger.tax_code}</span> : null}
            </Riga>
            <Riga label="Email">
              {passenger.email ? (
                <a href={`mailto:${passenger.email}`} className="text-accent underline-offset-2 hover:underline">
                  {passenger.email}
                </a>
              ) : null}
            </Riga>
            <Riga label="Telefono">
              {passenger.phone ? <span className="num">{passenger.phone}</span> : null}
            </Riga>
            <Riga label="Cliente">
              {customer ? (
                <Link href={`/clienti/${customer.id}`} className="text-accent underline-offset-2 hover:underline">
                  {customer.display_name}
                </Link>
              ) : null}
            </Riga>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IdCard className="size-4 text-text-subtle" aria-hidden="true" />
              <CardTitle>Documento</CardTitle>
            </div>
            <Badge tone={info.tone} dot>
              {info.label}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Riga label="Tipo">
              {passenger.document_type ? DOCUMENT_LABELS[passenger.document_type] : null}
            </Riga>
            <Riga label="Numero">
              {passenger.document_number ? <span className="num">{passenger.document_number}</span> : null}
            </Riga>
            <Riga label="Rilasciato il">{formatDateShort(passenger.document_issued_at)}</Riga>
            <Riga label="Scade il">{formatDateShort(passenger.document_expires_at)}</Riga>
            <Riga label="Rilasciato da">{passenger.document_issuer}</Riga>
            {documentState?.next_return_date ? (
              <Riga label="Prossimo rientro">
                {formatDateShort(documentState.next_return_date)}
              </Riga>
            ) : null}
          </CardContent>
        </Card>

        {passenger.dietary_needs || passenger.special_needs || passenger.notes ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Esigenze e note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Riga label="Esigenze alimentari">{passenger.dietary_needs}</Riga>
              <Riga label="Esigenze particolari">{passenger.special_needs}</Riga>
              <Riga label="Programma fedeltà">{passenger.frequent_flyer}</Riga>
              {passenger.notes ? (
                <p className="whitespace-pre-wrap pt-2 text-small text-text">{passenger.notes}</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Viaggi ({bookings.length})</CardTitle>
        </CardHeader>
        <CardContent className={bookings.length === 0 ? undefined : 'p-0'}>
          {bookings.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title="Nessun viaggio"
              description="Le pratiche in cui questo passeggero compare verranno elencate qui."
            />
          ) : (
            <TableWrapper className="rounded-none border-0 shadow-none">
              <Table>
                <caption className="sr-only">Viaggi del passeggero</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Pratica</TableHeaderCell>
                    <TableHeaderCell>Destinazione</TableHeaderCell>
                    <TableHeaderCell>Periodo</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell>
                        <Link
                          href={`/pratiche/${booking.id}`}
                          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                        >
                          {booking.code}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{booking.destination}</TableCell>
                      <TableCell className="num">
                        {formatDateRange(booking.departure_date, booking.return_date)}
                      </TableCell>
                      <TableCell>
                        <BookingStatusBadge status={booking.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Riga({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-40 shrink-0 text-small text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-small text-text">
        {children ?? <span className="text-text-subtle">—</span>}
      </span>
    </div>
  )
}
