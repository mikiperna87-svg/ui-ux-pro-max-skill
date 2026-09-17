import {
  Banknote,
  CalendarClock,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Percent,
  Phone,
  ShoppingCart,
  UserRound,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { PayoutStatusBadge } from '@/components/domain/status-badge'
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
import { formatDateShort, formatRelativeDays } from '@/lib/date'
import { SERVICE_TYPE, SUPPLIER_KIND, VAT_REGIME, plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { getSupplierDetail } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { StatoFornitore } from './stato-fornitore'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getSupplierDetail(id)
  return { title: detail?.supplier.name ?? 'Fornitore' }
}

export default async function FornitorePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const detail = await getSupplierDetail(id)

  if (!detail) notFound()

  const { supplier, stats, payments, services } = detail

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={supplier.name}
        description={[
          SUPPLIER_KIND[supplier.kind],
          supplier.city,
          supplier.vat_number ? `P. IVA ${supplier.vat_number}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fornitori">Torna all’elenco</Link>
            </Button>
            {session.permissions.write ? (
              <>
                <StatoFornitore supplierId={supplier.id} active={supplier.is_active} />
                <Button asChild variant="primary" size="sm">
                  <Link href={`/fornitori/${supplier.id}/modifica`}>
                    <Pencil aria-hidden="true" />
                    Modifica
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {!supplier.is_active ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-small text-text-muted"
        >
          Fornitore disattivato: resta nello storico ma non compare fra quelli selezionabili in una
          nuova pratica.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SintesiCard
          label="Acquistato"
          value={formatEuro(stats?.cost_cents ?? 0)}
          hint={`${plurale(stats?.services_count ?? 0, 'servizio', 'servizi')} su ${plurale(stats?.bookings_count ?? 0, 'pratica', 'pratiche')}`}
          icon={<ShoppingCart />}
        />
        {session.permissions.margins ? (
          <SintesiCard
            label="Margine generato"
            value={formatEuro(stats?.margin_cents ?? 0)}
            hint={`${formatPercent(stats?.margin_bps ?? 0)} sul venduto`}
            icon={<Percent />}
            tone="positive"
          />
        ) : (
          <SintesiCard
            label="Venduto"
            value={formatEuro(stats?.revenue_cents ?? 0)}
            hint="Prezzo praticato ai clienti"
            icon={<ShoppingCart />}
          />
        )}
        <SintesiCard
          label="Da pagare"
          value={formatEuro(stats?.open_payable_cents ?? 0)}
          hint={
            (stats?.overdue_payable_cents ?? 0) > 0
              ? `di cui ${formatEuro(stats?.overdue_payable_cents ?? 0)} scaduti`
              : 'Nessuna scadenza superata'
          }
          icon={<Banknote />}
          tone={(stats?.overdue_payable_cents ?? 0) > 0 ? 'critical' : 'default'}
        />
        <SintesiCard
          label="Prossima scadenza"
          value={stats?.next_due_date ? formatDateShort(stats.next_due_date) : '—'}
          hint={
            stats?.next_due_date
              ? formatRelativeDays(stats.next_due_date)
              : `Dilazione ${supplier.payment_terms_days} giorni`
          }
          icon={<CalendarClock />}
        />
      </div>

      <Tabs defaultValue="condizioni">
        <TabsList>
          <TabsTrigger value="condizioni">Condizioni</TabsTrigger>
          <TabsTrigger value="scadenzario">Scadenzario ({payments.length})</TabsTrigger>
          <TabsTrigger value="servizi">Servizi ({services.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="condizioni">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Contatti</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Riga icon={<UserRound />} label="Referente">
                  {supplier.contact_name}
                </Riga>
                <Riga icon={<Mail />} label="Email">
                  {supplier.email ? (
                    <a href={`mailto:${supplier.email}`} className="text-accent underline-offset-2 hover:underline">
                      {supplier.email}
                    </a>
                  ) : null}
                </Riga>
                <Riga icon={<Mail />} label="PEC">
                  {supplier.pec}
                </Riga>
                <Riga icon={<Phone />} label="Telefono">
                  {supplier.phone ? <span className="num">{supplier.phone}</span> : null}
                </Riga>
                <Riga icon={<MapPin />} label="Sede">
                  {[supplier.address_line, supplier.postal_code, supplier.city, supplier.province]
                    .filter(Boolean)
                    .join(', ') || null}
                </Riga>
                <Riga icon={<Globe />} label="Portale">
                  {supplier.booking_portal_url ? (
                    <a
                      href={supplier.booking_portal_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-accent underline-offset-2 hover:underline"
                    >
                      {supplier.booking_portal_url}
                    </a>
                  ) : null}
                </Riga>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Condizioni commerciali</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <Riga label="Dilazione di pagamento">
                  <span className="num">{supplier.payment_terms_days}</span> giorni
                </Riga>
                <Riga label="Commissione predefinita">
                  {formatPercent(supplier.default_commission_bps)}
                </Riga>
                <Riga label="Regime IVA predefinito">
                  <span>
                    {VAT_REGIME[supplier.default_vat_regime].label}
                    <span className="mt-0.5 block text-caption text-text-muted">
                      {VAT_REGIME[supplier.default_vat_regime].note}
                    </span>
                  </span>
                </Riga>
                <Riga label="IBAN">
                  {supplier.iban ? <span className="num break-all">{supplier.iban}</span> : null}
                </Riga>
                <Riga label="Partita IVA">
                  {supplier.vat_number ? <span className="num">{supplier.vat_number}</span> : null}
                </Riga>
                <Riga label="Codice fiscale">
                  {supplier.tax_code ? <span className="num">{supplier.tax_code}</span> : null}
                </Riga>
              </CardContent>
            </Card>

            {supplier.notes ? (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Note</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-small text-text">{supplier.notes}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="scadenzario">
          {payments.length === 0 ? (
            <EmptyState
              icon={<Banknote />}
              title="Nessun pagamento registrato"
              description="Gli impegni verso questo fornitore compariranno qui, con la loro scadenza."
            />
          ) : (
            <TableWrapper>
              <Table>
                <caption className="sr-only">Scadenzario dei pagamenti al fornitore</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Scadenza</TableHeaderCell>
                    <TableHeaderCell>Pratica</TableHeaderCell>
                    <TableHeaderCell>Riferimento</TableHeaderCell>
                    <TableHeaderCell className="text-right">Importo</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                    <TableHeaderCell>Pagato il</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {payments.map((payment) => {
                    const overdue =
                      payment.status !== 'pagato' &&
                      payment.status !== 'stornato' &&
                      payment.due_date < new Date().toISOString().slice(0, 10)
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className={overdue ? 'num text-danger' : 'num'}>
                          {formatDateShort(payment.due_date)}
                        </TableCell>
                        <TableCell className="num text-text-muted">
                          {payment.booking_id ? (
                            <span>{payment.supplier_invoice_number ?? '—'}</span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="num text-text-muted">{payment.reference ?? '—'}</TableCell>
                        <TableCellNumeric className="font-medium">
                          {formatEuro(payment.amount_cents)}
                        </TableCellNumeric>
                        <TableCell>
                          <PayoutStatusBadge status={payment.status} />
                        </TableCell>
                        <TableCell className="num">{formatDateShort(payment.paid_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          )}
        </TabsContent>

        <TabsContent value="servizi">
          {services.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart />}
              title="Nessun servizio acquistato"
              description="I servizi comprati da questo fornitore compariranno qui, con costo e ricarico."
            />
          ) : (
            <TableWrapper>
              <Table>
                <caption className="sr-only">Servizi acquistati dal fornitore</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Data</TableHeaderCell>
                    <TableHeaderCell>Pratica</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Descrizione</TableHeaderCell>
                    <TableHeaderCell className="text-right">Costo</TableHeaderCell>
                    <TableHeaderCell className="text-right">Venduto</TableHeaderCell>
                    {session.permissions.margins ? (
                      <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                    ) : null}
                  </tr>
                </TableHead>
                <TableBody>
                  {services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="num">{formatDateShort(service.date_from)}</TableCell>
                      <TableCell>
                        {service.booking_id ? (
                          <Link
                            href={`/pratiche/${service.booking_id}`}
                            className="num text-text-muted underline-offset-2 hover:text-accent hover:underline"
                          >
                            {service.booking_code ?? '—'}
                          </Link>
                        ) : (
                          <span className="num text-text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone="neutral">{SERVICE_TYPE[service.service_type]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{service.description}</TableCell>
                      <TableCellNumeric>{formatEuro(service.total_cost_cents)}</TableCellNumeric>
                      <TableCellNumeric>{formatEuro(service.total_price_cents)}</TableCellNumeric>
                      {session.permissions.margins ? (
                        <TableCellNumeric className="text-success">
                          {formatEuro(
                            service.total_price_cents -
                              service.total_cost_cents +
                              service.commission_cents,
                          )}
                        </TableCellNumeric>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
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
  tone?: 'default' | 'positive' | 'critical'
}) {
  const toneClass = {
    default: 'text-text',
    positive: 'text-success',
    critical: 'text-danger',
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
      <span className="w-44 shrink-0 text-small text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-small text-text">
        {children ?? <span className="text-text-subtle">—</span>}
      </span>
    </div>
  )
}
