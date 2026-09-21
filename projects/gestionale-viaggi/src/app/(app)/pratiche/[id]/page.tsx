import {
  Banknote,
  CalendarClock,
  CalendarDays,
  History,
  Luggage,
  MapPin,
  Paperclip,
  Pencil,
  Percent,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/domain/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateLong, formatDateShort, formatDateTime, formatRelativeDays } from '@/lib/date'
import { SALE_TYPE, plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import {
  bookingAmounts,
  getBookingDetail,
  operatorOptions,
  passengerOptions,
  supplierOptions,
} from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { AttivitaPratica } from './attivita-pratica'
import { AzioniPratica } from './azioni-pratica'
import { DocumentiPratica } from './documenti-pratica'
import { FatturePratica } from './fatture-pratica'
import { IncassiPratica } from './incassi-pratica'
import { PasseggeriPratica } from './passeggeri-pratica'
import { ServiziPratica } from './servizi-pratica'

/** Schede della pratica raggiungibili da un collegamento esterno. */
const SCHEDE = ['riepilogo', 'passeggeri', 'servizi', 'incassi', 'documenti', 'cronologia'] as const

function schedaValida(value: string | string[] | undefined): (typeof SCHEDE)[number] {
  const primo = Array.isArray(value) ? value[0] : value
  return (SCHEDE as readonly string[]).includes(primo ?? '')
    ? (primo as (typeof SCHEDE)[number])
    : 'riepilogo'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOppureNulla(value: string | string[] | undefined): string | undefined {
  const primo = Array.isArray(value) ? value[0] : value
  return primo !== undefined && UUID.test(primo) ? primo : undefined
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getBookingDetail(id)
  return { title: detail ? `${detail.booking.code} · ${detail.booking.destination}` : 'Pratica' }
}

export default async function PraticaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSession()
  const { id } = await params
  const raw = await searchParams
  const detail = await getBookingDetail(id)

  if (!detail) notFound()

  const {
    booking,
    summary,
    customer,
    services,
    passengers,
    installments,
    paymentsIn,
    paymentsOut,
    documents,
    tasks,
    invoices,
    activity,
  } = detail

  const [suppliers, candidates, operatori] = await Promise.all([
    session.permissions.write ? supplierOptions() : Promise.resolve([]),
    session.permissions.write ? passengerOptions() : Promise.resolve([]),
    session.permissions.write ? operatorOptions() : Promise.resolve([]),
  ])

  const importi = bookingAmounts(summary)
  const canWrite = session.permissions.write
  const showMargins = session.permissions.margins

  // Lo scadenzario manda qui con la scheda e la rata gia' scelte: "Incassa"
  // deve aprire il modulo giusto, non lasciare l'operatore a ritrovare la riga.
  const schedaIniziale = schedaValida(raw.scheda)
  const rataDaIncassare = uuidOppureNulla(raw.rata)

  const depositHint = `Nascono alla conferma della pratica: acconto del ${formatPercent(
    session.settings.deposit_percent_bps,
    0,
  )} entro ${plurale(session.settings.deposit_due_days, 'giorno', 'giorni')}, saldo ${plurale(
    session.settings.balance_due_days_before_departure,
    'giorno',
    'giorni',
  )} prima della partenza.`

  // Passeggeri il cui documento non copre il rientro: è l'informazione che
  // trasforma un imbarco negato in una telefonata fatta per tempo.
  const documentiDaSistemare = passengers.filter(
    (riga) => riga.document_state === 'assente' || riga.document_state === 'scaduto' || riga.document_state === 'scade_prima_del_rientro',
  )

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title={`${booking.code} · ${booking.destination}`}
        description={[
          booking.title,
          customer?.display_name,
          booking.departure_date ? `Parte il ${formatDateLong(booking.departure_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/pratiche">Torna all’elenco</Link>
            </Button>
            {canWrite ? (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/pratiche/${booking.id}/modifica`}>
                    <Pencil aria-hidden="true" />
                    Modifica
                  </Link>
                </Button>
                <AzioniPratica
                  bookingId={booking.id}
                  code={booking.code}
                  status={booking.status}
                  depositDays={session.settings.deposit_due_days}
                  balanceDays={session.settings.balance_due_days_before_departure}
                  depositPercent={formatPercent(session.settings.deposit_percent_bps, 0)}
                />
              </>
            ) : null}
          </>
        }
      />

      {booking.status === 'annullata' ? (
        <p
          role="status"
          className="rounded-lg border border-danger-subtle bg-danger-subtle/50 px-3 py-2 text-small text-danger-fg"
        >
          Pratica annullata{booking.cancelled_at ? ` il ${formatDateLong(booking.cancelled_at)}` : ''}:{' '}
          {booking.cancellation_reason}
          {booking.cancellation_penalty_cents > 0
            ? ` — penale trattenuta ${formatEuro(booking.cancellation_penalty_cents)}`
            : ''}
        </p>
      ) : null}

      {documentiDaSistemare.length > 0 ? (
        <p
          role="status"
          className="rounded-lg border border-warning-subtle bg-warning-subtle/50 px-3 py-2 text-small text-warning-fg"
        >
          {plurale(documentiDaSistemare.length, 'passeggero ha', 'passeggeri hanno')} un documento da
          sistemare: {documentiDaSistemare.map((riga) => riga.full_name).join(', ')}.
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <Tabs defaultValue={schedaIniziale}>
            <TabsList>
              <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
              <TabsTrigger value="passeggeri">
                Passeggeri{passengers.length > 0 ? ` (${passengers.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="servizi">
                Servizi e costi{services.length > 0 ? ` (${services.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="incassi">Incassi e scadenze</TabsTrigger>
              <TabsTrigger value="documenti">
                Documenti{documents.length > 0 ? ` (${documents.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="cronologia">Note e cronologia</TabsTrigger>
            </TabsList>

            <TabsContent value="riepilogo">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Il viaggio</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <Riga icon={<MapPin />} label="Destinazione">
                      {[booking.destination, booking.country].filter(Boolean).join(' · ')}
                    </Riga>
                    <Riga icon={<CalendarDays />} label="Partenza">
                      {booking.departure_date ? (
                        <>
                          <span className="num">{formatDateShort(booking.departure_date)}</span>
                          <span className="ml-2 text-caption text-text-muted">
                            {formatRelativeDays(booking.departure_date)}
                          </span>
                        </>
                      ) : null}
                    </Riga>
                    <Riga icon={<CalendarDays />} label="Rientro">
                      {booking.return_date ? (
                        <span className="num">{formatDateShort(booking.return_date)}</span>
                      ) : null}
                    </Riga>
                    <Riga icon={<Users />} label="Passeggeri dichiarati">
                      <span className="num">{booking.pax_count}</span>
                      {passengers.length !== booking.pax_count ? (
                        <span className="ml-2 text-caption text-warning-fg">
                          {plurale(passengers.length, 'collegato', 'collegati')}
                        </span>
                      ) : null}
                    </Riga>
                    <Riga icon={<Luggage />} label="Tipo di vendita">
                      {SALE_TYPE[booking.sale_type]}
                    </Riga>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Il cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <Riga icon={<UserRound />} label="Intestatario">
                      {customer ? (
                        <Link
                          href={`/clienti/${customer.id}`}
                          className="font-medium underline-offset-2 hover:text-accent hover:underline"
                        >
                          {customer.display_name}
                        </Link>
                      ) : null}
                    </Riga>
                    <Riga label="Email">{customer?.email}</Riga>
                    <Riga label="Telefono">{customer?.mobile ?? customer?.phone}</Riga>
                    <Riga label="Partita IVA">{customer?.vat_number}</Riga>
                    <Riga label="Codice fiscale">{customer?.tax_code}</Riga>
                  </CardContent>
                </Card>

                <AttivitaPratica
                  bookingId={booking.id}
                  customerId={booking.customer_id}
                  tasks={tasks}
                  operatori={operatori}
                  canWrite={canWrite}
                />
              </div>
            </TabsContent>

            <TabsContent value="passeggeri">
              <PasseggeriPratica
                bookingId={booking.id}
                passengers={passengers}
                candidates={candidates}
                canWrite={canWrite}
              />
            </TabsContent>

            <TabsContent value="servizi">
              <ServiziPratica
                bookingId={booking.id}
                services={services}
                suppliers={suppliers}
                canWrite={canWrite}
                showMargins={showMargins}
                defaultVatBps={session.settings.default_vat_bps}
                defaultVatRegime={
                  booking.sale_type === 'organizzazione' ? 'art_74_ter' : 'ordinaria'
                }
              />
            </TabsContent>

            <TabsContent value="incassi">
              <div className="space-y-4">
                <IncassiPratica
                  bookingId={booking.id}
                  bookingCode={booking.code}
                  installments={installments}
                  paymentsIn={paymentsIn}
                  payouts={session.permissions.accounting ? paymentsOut : []}
                  residuoCents={importi.balance}
                  depositHint={depositHint}
                  canManage={session.permissions.accounting}
                  rataDaIncassare={rataDaIncassare}
                  customerEmail={customer?.email ?? null}
                  customerName={customer?.display_name ?? null}
                />

                <FatturePratica
                  bookingId={booking.id}
                  saleType={booking.sale_type}
                  invoices={invoices}
                  canManage={session.permissions.accounting}
                  canInvoice={booking.status !== 'opzione' && booking.status !== 'annullata'}
                />
              </div>
            </TabsContent>

            <TabsContent value="documenti">
              <DocumentiPratica
                bookingId={booking.id}
                documents={documents}
                canWrite={canWrite}
              />
            </TabsContent>

            <TabsContent value="cronologia">
              <div className="space-y-4">
                {booking.notes || booking.internal_notes ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {booking.notes ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>Note per il cliente</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="whitespace-pre-line text-small text-text">{booking.notes}</p>
                        </CardContent>
                      </Card>
                    ) : null}
                    {booking.internal_notes ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>Note interne</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="whitespace-pre-line text-small text-text">
                            {booking.internal_notes}
                          </p>
                        </CardContent>
                      </Card>
                    ) : null}
                  </div>
                ) : null}

                {activity.length === 0 ? (
                  <EmptyState
                    icon={<History />}
                    title="Nessuna attività registrata"
                    description="Ogni conferma, modifica economica ed eliminazione compare qui, con autore e data."
                  />
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                    {activity.map((entry) => (
                      <li key={entry.id} className="px-4 py-3">
                        <p className="text-small text-text">{entry.summary}</p>
                        <p className="mt-0.5 text-caption text-text-muted">
                          {entry.actor_label} · {formatDateTime(entry.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Il quadro economico resta sempre in vista: è la domanda che si fa
            chi apre una pratica, a qualunque scheda si trovi. */}
        <aside aria-label="Riepilogo economico della pratica" className="xl:sticky xl:top-[calc(var(--container-topbar)+1.25rem)] xl:self-start">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4 shadow-e1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-small font-semibold text-text">Quadro economico</h2>
              <BookingStatusBadge status={booking.status} />
            </div>

            <Totale label="Venduto" value={formatEuro(importi.revenue)} icon={<TrendingUp />} forte />
            {showMargins ? (
              <>
                <Totale label="Costo fornitori" value={formatEuro(importi.cost)} icon={<Banknote />} />
                <Totale
                  label="Commissioni attive"
                  value={formatEuro(importi.commission)}
                  icon={<Percent />}
                />
                <div className="rounded-md border border-success-subtle bg-success-subtle/40 px-3 py-2">
                  <p className="text-caption font-medium uppercase tracking-wide text-success-fg">
                    Margine
                  </p>
                  <p className="num mt-1 text-metric-sm text-success">
                    {formatEuro(importi.margin)}
                  </p>
                  <p className="mt-1 text-caption text-success-fg">
                    {formatPercent(importi.marginBps)} sul venduto
                  </p>
                </div>
              </>
            ) : null}

            <hr className="border-border" />

            <Totale label="Incassato" value={formatEuro(importi.paid)} icon={<Wallet />} />
            <Totale
              label="Da incassare"
              value={formatEuro(importi.balance)}
              icon={<CalendarClock />}
              forte={importi.balance > 0}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-small text-text-muted">Stato</span>
              <PaymentStateBadge state={importi.paymentState} />
            </div>
            {summary?.next_due_date ? (
              <p className="text-caption text-text-muted">
                Prossima scadenza il{' '}
                <span className="num">{formatDateShort(summary.next_due_date)}</span> ·{' '}
                {formatRelativeDays(summary.next_due_date)}
              </p>
            ) : null}

            {session.permissions.accounting && importi.supplierDue > 0 ? (
              <>
                <hr className="border-border" />
                <Totale
                  label="Da pagare ai fornitori"
                  value={formatEuro(importi.supplierDue)}
                  icon={<Banknote />}
                />
              </>
            ) : null}

            <hr className="border-border" />

            <dl className="space-y-1.5 text-caption text-text-muted">
              <div className="flex justify-between gap-2">
                <dt>Operatore</dt>
                <dd className="text-text">{summary?.owner_name ?? 'Non assegnata'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Servizi</dt>
                <dd className="num text-text">{services.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Documenti</dt>
                <dd className="num text-text">{documents.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Aperta il</dt>
                <dd className="num text-text">{formatDateShort(booking.created_at)}</dd>
              </div>
            </dl>

            {documents.length === 0 && booking.status === 'confermata' ? (
              <p className="flex items-start gap-2 rounded-md border border-warning-subtle bg-warning-subtle/40 px-3 py-2 text-caption text-warning-fg">
                <Paperclip className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Pratica confermata senza voucher allegato.
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Totale({
  label,
  value,
  icon,
  forte = false,
}: {
  label: string
  value: string
  icon: React.ReactNode
  forte?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-small text-text-muted">
        <span className="text-text-subtle [&_svg]:size-3.5">{icon}</span>
        {label}
      </span>
      <span className={`num text-small ${forte ? 'font-semibold text-text' : 'text-text'}`}>
        {value}
      </span>
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
      <span className="w-36 shrink-0 text-small text-text-muted">{label}</span>
      <span className="min-w-0 flex-1 break-words text-small text-text">
        {children ?? <span className="text-text-subtle">—</span>}
      </span>
    </div>
  )
}
