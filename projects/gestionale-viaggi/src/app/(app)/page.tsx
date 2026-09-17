import {
  Banknote,
  CalendarClock,
  Clock3,
  Percent,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { BookingStatusBadge, PaymentStateBadge, PayoutStatusBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateShort, formatDateTime, formatRelativeDays, toIsoDateOnly } from '@/lib/date'
import { ACTIVITY_ACTION, plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  getDashboardKpis,
  getMonthlyTrend,
  getRecentActivity,
  getSupplierPayments,
  getUpcomingDepartures,
} from '@/server/queries/dashboard'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Panoramica' }

const PERIODS = [
  { key: '30', label: '30 giorni', days: 30 },
  { key: '90', label: '90 giorni', days: 90 },
  { key: '365', label: '12 mesi', days: 365 },
] as const

export default async function PanoramicaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const session = await requireSession()
  const params = await searchParams
  const period = PERIODS.find((entry) => entry.key === params.periodo) ?? PERIODS[2]

  // L’operatore vede solo i propri numeri: e' la stessa regola della RLS,
  // ripetuta qui perché' le funzioni di aggregazione accettano un filtro.
  const ownerId = session.permissions.allBookings ? null : session.membership.id

  const today = new Date()
  const from = toIsoDateOnly(new Date(today.getTime() - period.days * 86_400_000))
  const to = toIsoDateOnly(new Date(today.getTime() + 365 * 86_400_000))

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Buongiorno, ${session.membership.full_name.split(' ')[0]}`}
        description={`${session.agency.name} · periodo di partenza: ultimi ${period.label} e partenze future`}
        actions={
          <nav aria-label="Periodo" className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
            {PERIODS.map((entry) => (
              <Link
                key={entry.key}
                href={entry.key === '365' ? '/' : `/?periodo=${entry.key}`}
                aria-current={entry.key === period.key ? 'true' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1 text-caption font-medium transition-colors duration-150',
                  entry.key === period.key
                    ? 'bg-surface text-text shadow-e1'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        }
      />

      {/* Un solo confine Suspense per tutto il corpo della pagina.
          Cinque confini fratelli che si sospendevano insieme a ogni cambio di
          periodo mandavano in stallo la transizione del router di Next 15 una
          volta su quattro: il periodo restava quello di prima senza spiegazioni
          (misurato, e documentato in DECISIONI.md). L'intestazione compare
          comunque subito, e le aree dati si riempiono insieme. */}
      <Suspense
        key={period.key}
        fallback={<PanoramicaScheletro showMargins={session.permissions.margins} />}
      >
        <CorpoPanoramica
          from={from}
          to={to}
          ownerId={ownerId}
          showMargins={session.permissions.margins}
          showAccounting={session.permissions.accounting}
        />
      </Suspense>
    </div>
  )
}

async function CorpoPanoramica({
  from,
  to,
  ownerId,
  showMargins,
  showAccounting,
}: {
  from: string
  to: string
  ownerId: string | null
  showMargins: boolean
  showAccounting: boolean
}) {
  // Le sezioni non dipendono l'una dall'altra: partono insieme.
  const [kpi, andamento, attivita, partenze, fornitori] = await Promise.all([
    KpiSection({ from, to, ownerId, showMargins }),
    TrendSection({ ownerId }),
    ActivitySection(),
    DeparturesSection({ ownerId }),
    showAccounting ? SupplierSection() : Promise.resolve(null),
  ])

  return (
    <>
      {kpi}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Andamento mensile</CardTitle>
          </CardHeader>
          <CardContent>{andamento}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultime attività</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{attivita}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Partenze nei prossimi 30 giorni</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{partenze}</CardContent>
        </Card>

        {fornitori ? (
          <Card>
            <CardHeader>
              <CardTitle>Pagamenti a fornitore in scadenza</CardTitle>
            </CardHeader>
            <CardContent className="p-0">{fornitori}</CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}

/** Scheletro dell'intero corpo: stessa forma di ciò che sta arrivando. */
function PanoramicaScheletro({ showMargins }: { showMargins: boolean }) {
  return (
    <>
      <KpiSkeleton showMargins={showMargins} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Andamento mensile</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ultime attività</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ListSkeleton rows={6} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Partenze nei prossimi 30 giorni</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ListSkeleton rows={5} />
          </CardContent>
        </Card>
        {showMargins ? (
          <Card>
            <CardHeader>
              <CardTitle>Pagamenti a fornitore in scadenza</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ListSkeleton rows={5} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  )
}

async function KpiSection({
  from,
  to,
  ownerId,
  showMargins,
}: {
  from: string
  to: string
  ownerId: string | null
  showMargins: boolean
}) {
  const kpis = await getDashboardKpis(from, to, ownerId)

  return (
    <section aria-label="Indicatori del periodo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Venduto"
        value={formatEuro(kpis.revenueCents)}
        hint={`${plurale(kpis.bookingsCount, 'pratica', 'pratiche')} · ${kpis.confirmedCount} ${kpis.confirmedCount === 1 ? 'confermata' : 'confermate'}`}
        icon={<TrendingUp />}
      />
      {showMargins ? (
        <KpiCard
          label="Margine"
          value={formatEuro(kpis.marginCents)}
          hint={`${formatPercent(kpis.marginBps)} sul venduto`}
          icon={<Percent />}
          tone={kpis.marginCents >= 0 ? 'positive' : 'critical'}
        />
      ) : (
        <KpiCard
          label="Ticket medio"
          value={formatEuro(kpis.averageTicketCents)}
          hint="Valore medio per pratica"
          icon={<Wallet />}
        />
      )}
      <KpiCard
        label="Da incassare"
        value={formatEuro(kpis.receivableCents)}
        hint={
          kpis.overdueCents > 0
            ? `di cui ${formatEuro(kpis.overdueCents)} già scaduti`
            : 'Nessun saldo scaduto'
        }
        icon={<Banknote />}
        tone={kpis.overdueCents > 0 ? 'attention' : 'default'}
      />
      <KpiCard
        label="Da pagare ai fornitori"
        value={formatEuro(kpis.supplierDueCents)}
        hint="Impegni ancora aperti sulle pratiche del periodo"
        icon={<Clock3 />}
      />
    </section>
  )
}

async function TrendSection({ ownerId }: { ownerId: string | null }) {
  const points = await getMonthlyTrend(12, ownerId)
  const hasData = points.some((point) => point.revenueCents > 0)

  if (!hasData) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="Ancora nessun venduto"
        description="Quando registrerai le prime pratiche con data di partenza, qui comparirà l’andamento mese per mese."
      />
    )
  }

  return <TrendChart points={points} />
}

async function ActivitySection() {
  const activities = await getRecentActivity(7)

  if (activities.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Clock3 />}
          title="Nessuna attività registrata"
          description="Ogni operazione economica e ogni modifica compariranno qui, con autore e data."
        />
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {activities.map((activity) => (
        <li key={activity.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-small text-text">{activity.summary}</p>
            <p className="mt-0.5 text-caption text-text-muted">
              {activity.actor_label} · {formatDateTime(activity.created_at)}
            </p>
          </div>
          <Badge tone="neutral" className="shrink-0">
            {ACTIVITY_ACTION[activity.action]}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

async function DeparturesSection({ ownerId }: { ownerId: string | null }) {
  const departures = await getUpcomingDepartures(30, 6, ownerId)

  if (departures.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<CalendarClock />}
          title="Nessuna partenza nei prossimi 30 giorni"
          description="Le pratiche in opzione o confermate con partenza imminente compariranno qui, con il loro stato di pagamento."
        />
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {departures.map((departure) => (
        <li key={departure.bookingId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <Link
              href={`/pratiche/${departure.bookingId}`}
              className="flex items-baseline gap-2 text-small font-medium text-text underline-offset-2 hover:text-accent hover:underline"
            >
              <span className="num shrink-0 text-text-muted">{departure.code}</span>
              <span className="truncate">{departure.destination}</span>
            </Link>
            <p className="mt-0.5 truncate text-caption text-text-muted">
              {departure.customerName} · {departure.paxCount} pax
              {departure.ownerName ? ` · ${departure.ownerName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <span className="num text-caption text-text-muted" title={formatDateShort(departure.departureDate)}>
              {formatRelativeDays(departure.departureDate)}
            </span>
            <BookingStatusBadge status={departure.status} />
            <PaymentStateBadge state={departure.paymentState} />
          </div>
        </li>
      ))}
    </ul>
  )
}

async function SupplierSection() {
  const payments = await getSupplierPayments(14, 6)

  if (payments.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          icon={<Banknote />}
          title="Nessuna scadenza nei prossimi 14 giorni"
          description="Qui compariranno i pagamenti ai fornitori in avvicinamento, per non arrivare mai in ritardo su una conferma."
        />
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {payments.map((payment) => (
        <li key={payment.paymentId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 sm:flex-1">
            <p className="truncate text-small font-medium text-text">{payment.supplierName}</p>
            <p className="mt-0.5 text-caption text-text-muted">
              {payment.bookingCode ? <span className="num">{payment.bookingCode} · </span> : null}
              scadenza {formatDateShort(payment.dueDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <span
              className={cn(
                'num text-small font-medium',
                payment.daysLeft < 0 ? 'text-danger' : 'text-text',
              )}
            >
              {formatEuro(payment.amountCents)}
            </span>
            <PayoutStatusBadge status={payment.status} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function KpiSkeleton({ showMargins }: { showMargins: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden={!showMargins}>
      {Array.from({ length: 4 }).map((_unused, index) => (
        <div key={index} className="rounded-lg border border-border bg-surface p-4 shadow-e1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <ul className="divide-y divide-border">
      {Array.from({ length: rows }).map((_unused, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  )
}
