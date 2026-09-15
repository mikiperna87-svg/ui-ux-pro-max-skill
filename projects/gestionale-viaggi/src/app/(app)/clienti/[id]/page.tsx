import {
  Banknote,
  CalendarClock,
  Mail,
  MapPin,
  Pencil,
  Percent,
  Phone,
  Plane,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { formatDateLong, formatDateShort, formatDateTime } from '@/lib/date'
import { ACTIVITY_ACTION, plurale } from '@/lib/labels'
import { formatEuro, formatPercent, ratioBps } from '@/lib/money'
import { getCustomerDetail } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { AzioniCliente } from './azioni-cliente'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getCustomerDetail(id)
  return { title: detail?.customer.display_name ?? 'Cliente' }
}

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const detail = await getCustomerDetail(id)

  if (!detail) notFound()

  const { customer, stats, passengers, bookings, invoices, activity } = detail
  const name = customer.display_name ?? '(senza nome)'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={name}
        description={[
          customer.kind === 'azienda' ? 'Azienda o ente' : 'Privato',
          customer.city,
          customer.vat_number ? `P. IVA ${customer.vat_number}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/clienti">Torna all’elenco</Link>
            </Button>
            {session.permissions.write ? (
              <Button asChild variant="primary" size="sm">
                <Link href={`/clienti/${customer.id}/modifica`}>
                  <Pencil aria-hidden="true" />
                  Modifica
                </Link>
              </Button>
            ) : null}
            <AzioniCliente
              customerId={customer.id}
              customerName={name}
              canAnonymize={session.permissions.accounting && customer.anonymized_at === null}
            />
          </>
        }
      />

      {customer.anonymized_at ? (
        <p
          role="status"
          className="rounded-lg border border-warning-subtle bg-warning-subtle/50 px-3 py-2 text-small text-warning-fg"
        >
          Scheda anonimizzata il {formatDateLong(customer.anonymized_at)} su richiesta
          dell’interessato. I dati fiscali obbligatori sono stati conservati.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SintesiCard
          label="Valore generato"
          value={formatEuro(stats?.lifetime_value_cents ?? 0)}
          hint={`${plurale(stats?.bookings_count ?? 0, 'pratica', 'pratiche')} · ${stats?.active_count ?? 0} in corso`}
          icon={<TrendingUp />}
        />
        {session.permissions.margins ? (
          <SintesiCard
            label="Margine generato"
            value={formatEuro(stats?.lifetime_margin_cents ?? 0)}
            hint={`${formatPercent(
              ratioBps(stats?.lifetime_margin_cents ?? 0, stats?.lifetime_value_cents ?? 0),
            )} sul venduto`}
            icon={<Percent />}
            tone="positive"
          />
        ) : (
          <SintesiCard
            label="Passeggeri collegati"
            value={String(stats?.passengers_count ?? 0)}
            hint="Familiari e accompagnatori in anagrafica"
            icon={<Users />}
          />
        )}
        <SintesiCard
          label="Da incassare"
          value={formatEuro(stats?.open_balance_cents ?? 0)}
          hint={(stats?.open_balance_cents ?? 0) > 0 ? 'Saldi ancora aperti' : 'Nessun saldo aperto'}
          icon={<Banknote />}
          tone={(stats?.open_balance_cents ?? 0) > 0 ? 'attention' : 'default'}
        />
        <SintesiCard
          label="Prossima partenza"
          value={stats?.next_departure ? formatDateShort(stats.next_departure) : '—'}
          hint={
            stats?.last_departure
              ? `Ultimo viaggio: ${formatDateShort(stats.last_departure)}`
              : 'Nessun viaggio registrato'
          }
          icon={<CalendarClock />}
        />
      </div>

      <Tabs defaultValue="riepilogo">
        <TabsList>
          <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
          <TabsTrigger value="viaggi">Viaggi ({bookings.length})</TabsTrigger>
          <TabsTrigger value="passeggeri">Passeggeri ({passengers.length})</TabsTrigger>
          <TabsTrigger value="fatture">Fatture ({invoices.length})</TabsTrigger>
          <TabsTrigger value="cronologia">Cronologia</TabsTrigger>
        </TabsList>

        <TabsContent value="riepilogo">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contatti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Riga icon={<Mail />} label="Email">
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="text-accent underline-offset-2 hover:underline">
                      {customer.email}
                    </a>
                  ) : null}
                </Riga>
                <Riga icon={<Phone />} label="Telefono">
                  {customer.phone ? <span className="num">{customer.phone}</span> : null}
                </Riga>
                <Riga icon={<Phone />} label="Cellulare">
                  {customer.mobile ? <span className="num">{customer.mobile}</span> : null}
                </Riga>
                <Riga icon={<MapPin />} label="Indirizzo">
                  {[customer.address_line, customer.postal_code, customer.city, customer.province]
                    .filter(Boolean)
                    .join(', ') || null}
                </Riga>
                {customer.preferred_contact ? (
                  <Riga label="Canale preferito">{customer.preferred_contact}</Riga>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dati fiscali e consensi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Riga label="Partita IVA">
                  {customer.vat_number ? <span className="num">{customer.vat_number}</span> : null}
                </Riga>
                <Riga label="Codice fiscale">
                  {customer.tax_code ? <span className="num">{customer.tax_code}</span> : null}
                </Riga>
                {customer.sdi_code ? (
                  <Riga label="Codice SDI">
                    <span className="num">{customer.sdi_code}</span>
                  </Riga>
                ) : null}
                <Riga icon={<ShieldCheck />} label="Informativa privacy">
                  {customer.privacy_consent_at ? (
                    <span>Accettata il {formatDateShort(customer.privacy_consent_at)}</span>
                  ) : (
                    <Badge tone="warning">Da raccogliere</Badge>
                  )}
                </Riga>
                <Riga label="Comunicazioni commerciali">
                  {customer.marketing_consent ? (
                    <Badge tone="success">
                      Sì, dal {formatDateShort(customer.marketing_consent_at)}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">No</Badge>
                  )}
                </Riga>
                <Riga label="Profilazione">
                  <Badge tone={customer.profiling_consent ? 'success' : 'neutral'}>
                    {customer.profiling_consent ? 'Sì' : 'No'}
                  </Badge>
                </Riga>
                {(customer.tags ?? []).length > 0 ? (
                  <Riga label="Tag">
                    <span className="flex flex-wrap gap-1">
                      {(customer.tags ?? []).map((tag) => (
                        <Badge key={tag} tone="accent">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </Riga>
                ) : null}
              </CardContent>
            </Card>

            {customer.notes ? (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Note</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-small text-text">{customer.notes}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="viaggi">
          {bookings.length === 0 ? (
            <EmptyState
              icon={<Plane />}
              title="Nessun viaggio registrato"
              description="Le pratiche intestate a questo cliente compariranno qui, con il loro stato di pagamento."
            />
          ) : (
            <TableWrapper>
              <Table>
                <caption className="sr-only">Viaggi del cliente</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Pratica</TableHeaderCell>
                    <TableHeaderCell>Destinazione</TableHeaderCell>
                    <TableHeaderCell>Partenza</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                    <TableHeaderCell className="text-right">Totale</TableHeaderCell>
                    {session.permissions.margins ? (
                      <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                    ) : null}
                    <TableHeaderCell>Pagamento</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="num font-medium">{booking.code}</TableCell>
                      <TableCell className="max-w-64 truncate">{booking.destination}</TableCell>
                      <TableCell className="num">{formatDateShort(booking.departure_date)}</TableCell>
                      <TableCell>
                        <BookingStatusBadge status={booking.status} />
                      </TableCell>
                      <TableCellNumeric>{formatEuro(booking.revenue_cents)}</TableCellNumeric>
                      {session.permissions.margins ? (
                        <TableCellNumeric className="text-success">
                          {formatEuro(booking.margin_cents)}
                        </TableCellNumeric>
                      ) : null}
                      <TableCell>
                        <PaymentStateBadge state={booking.payment_state} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        <TabsContent value="passeggeri">
          {passengers.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title="Nessun passeggero collegato"
              description="Collega familiari e accompagnatori: li ritroverai pronti quando costruirai una pratica."
              action={
                session.permissions.write ? (
                  <Button asChild variant="primary">
                    <Link href={`/passeggeri/nuovo?cliente=${customer.id}`}>Aggiungi passeggero</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrapper>
              <Table>
                <caption className="sr-only">Passeggeri collegati al cliente</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Passeggero</TableHeaderCell>
                    <TableHeaderCell>Nato il</TableHeaderCell>
                    <TableHeaderCell>Documento</TableHeaderCell>
                    <TableHeaderCell>Scadenza</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {passengers.map((passenger) => (
                    <TableRow key={passenger.id}>
                      <TableCell>
                        <Link
                          href={`/passeggeri/${passenger.id}`}
                          className="font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                        >
                          {passenger.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="num">{formatDateShort(passenger.birth_date)}</TableCell>
                      <TableCell>
                        {passenger.document_number ? (
                          <span className="num">{passenger.document_number}</span>
                        ) : (
                          <Badge tone="warning">Assente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="num">
                        {formatDateShort(passenger.document_expires_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        <TabsContent value="fatture">
          {invoices.length === 0 ? (
            <EmptyState
              icon={<Banknote />}
              title="Nessuna fattura"
              description="Le fatture e le note di credito intestate a questo cliente compariranno qui."
            />
          ) : (
            <TableWrapper>
              <Table>
                <caption className="sr-only">Fatture del cliente</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Numero</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Data</TableHeaderCell>
                    <TableHeaderCell className="text-right">Imponibile</TableHeaderCell>
                    <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                    <TableHeaderCell className="text-right">Totale</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="num font-medium">{invoice.code}</TableCell>
                      <TableCell>
                        {invoice.kind === 'nota_credito' ? 'Nota di credito' : 'Fattura'}
                      </TableCell>
                      <TableCell className="num">{formatDateShort(invoice.issue_date)}</TableCell>
                      <TableCellNumeric>{formatEuro(invoice.taxable_cents)}</TableCellNumeric>
                      <TableCellNumeric>{formatEuro(invoice.vat_cents)}</TableCellNumeric>
                      <TableCellNumeric className="font-medium">
                        {formatEuro(invoice.total_cents)}
                      </TableCellNumeric>
                      <TableCell>
                        <Badge tone={invoice.status === 'pagata' ? 'success' : 'neutral'}>
                          {invoice.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        <TabsContent value="cronologia">
          {activity.length === 0 ? (
            <EmptyState
              icon={<CalendarClock />}
              title="Nessuna attività registrata"
              description="Ogni modifica alla scheda comparirà qui, con autore e data."
            />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-text">{entry.summary}</p>
                    <p className="mt-0.5 text-caption text-text-muted">
                      {entry.actor_label} · {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                  <Badge tone="neutral">{ACTIVITY_ACTION[entry.action]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SintesiCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  icon: React.ReactNode
  tone?: 'default' | 'positive' | 'attention'
}) {
  const toneClass = {
    default: 'text-text',
    positive: 'text-success',
    attention: 'text-warning',
  }[tone]

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">{label}</p>
        <span className="text-text-subtle [&_svg]:size-4">{icon}</span>
      </div>
      <p className={`mt-2 num text-[1.375rem] font-semibold leading-none ${toneClass}`}>{value}</p>
      <p className="mt-1.5 text-caption text-text-muted">{hint}</p>
    </div>
  )
}

function Riga({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      {icon ? (
        <span className="mt-0.5 shrink-0 text-text-subtle [&_svg]:size-3.5">{icon}</span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="w-40 shrink-0 text-small text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-small text-text">
        {children ?? <span className="text-text-subtle">—</span>}
      </span>
    </div>
  )
}
