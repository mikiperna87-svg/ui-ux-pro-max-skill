import { Banknote, Download, Luggage, Percent, TrendingUp, Wallet } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { DeltaBadge } from '@/components/dashboard/delta-badge'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { formatDateShort } from '@/lib/date'
import { plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { periodoPrecedente, risolviPeriodo, variazioneBps, type Periodo } from '@/lib/report-period'
import { cn } from '@/lib/utils'
import { getDashboardKpis } from '@/server/queries/dashboard'
import {
  reportByDestination,
  reportByOwner,
  reportBySupplier,
  reportMonthly,
  reportQuotesByOwner,
} from '@/server/queries/report'
import { requireSession } from '@/server/session'
import {
  DESCRIZIONI_VISTA,
  ETICHETTE_VISTA,
  LIMITE_DESTINAZIONI,
  linkEsporta,
  linkVista,
  vistaDa,
  visteVisibili,
  type Vista,
} from './config'
import { VistaDestinazioni } from './destinazioni'
import { VistaFornitori } from './fornitori'
import { VistaOperatori } from './operatori'
import { SelettorePeriodo } from './selettore-periodo'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export const metadata: Metadata = { title: 'Report' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const periodo = risolviPeriodo(raw)
  const vista = vistaDa(raw.vista, session.permissions.margins)
  const precedente = periodoPrecedente(periodo.from, periodo.to)

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title="Report"
        description={`Dal ${formatDateShort(periodo.from)} al ${formatDateShort(periodo.to)}, per data di partenza. Confronto con il periodo precedente di pari durata (dal ${formatDateShort(precedente.from)} al ${formatDateShort(precedente.to)}).`}
        actions={
          <Button asChild variant="secondary" size="sm">
            <a href={linkEsporta(vista, periodo)} aria-label="Esporta la vista corrente">
              <Download aria-hidden="true" />
              <EtichettaBottone>Esporta</EtichettaBottone>
            </a>
          </Button>
        }
      />

      <SelettorePeriodo periodo={periodo} vista={vista} />

      <nav aria-label="Vista del report" className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {visteVisibili(session.permissions.margins).map((voce) => {
          const attiva = voce === vista
          return (
            <Link
              key={voce}
              href={linkVista(voce, periodo)}
              aria-current={attiva ? 'page' : undefined}
              className={cn(
                'relative -mb-px whitespace-nowrap border-b-2 px-3 py-2 text-small font-medium transition-colors duration-150',
                attiva
                  ? 'border-accent text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {ETICHETTE_VISTA[voce]}
            </Link>
          )
        })}
      </nav>

      {/* Un solo confine Suspense per pagina: più confini fratelli che si
          sospendono insieme mandano in stallo la transizione del router di
          Next 15 (misurato in fase 4, documentato in DECISIONI.md). */}
      <Suspense
        key={`${vista}-${periodo.from}-${periodo.to}`}
        fallback={<Scheletro mostraMargini={session.permissions.margins} />}
      >
        <Corpo
          periodo={periodo}
          vista={vista}
          mostraMargini={session.permissions.margins}
          ownerId={session.permissions.allBookings ? null : session.membership.id}
        />
      </Suspense>
    </div>
  )
}

async function Corpo({
  periodo,
  vista,
  mostraMargini,
  ownerId,
}: {
  periodo: Periodo
  vista: Vista
  mostraMargini: boolean
  ownerId: string | null
}) {
  const precedente = periodoPrecedente(periodo.from, periodo.to)

  const [attuale, prima, mesi, contenuto] = await Promise.all([
    getDashboardKpis(periodo.from, periodo.to, ownerId),
    getDashboardKpis(precedente.from, precedente.to, ownerId),
    reportMonthly(periodo.from, periodo.to),
    contenutoVista(vista, periodo, mostraMargini),
  ])

  const conDati = mesi.some((punto) => punto.revenueCents > 0)

  return (
    <div className="space-y-5">
      <section aria-label="Indicatori del periodo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Venduto"
          value={formatEuro(attuale.revenueCents)}
          icon={<TrendingUp />}
          delta={<DeltaBadge bps={variazioneBps(attuale.revenueCents, prima.revenueCents)} />}
          hint={`${plurale(attuale.bookingsCount, 'pratica', 'pratiche')} in partenza`}
        />
        {mostraMargini ? (
          <KpiCard
            label="Margine"
            value={formatEuro(attuale.marginCents)}
            icon={<Percent />}
            tone={attuale.marginCents >= 0 ? 'positive' : 'critical'}
            delta={<DeltaBadge bps={variazioneBps(attuale.marginCents, prima.marginCents)} />}
            hint={`${formatPercent(attuale.marginBps)} sul venduto · prima ${formatPercent(prima.marginBps)}`}
          />
        ) : (
          <KpiCard
            label="Ticket medio"
            value={formatEuro(attuale.averageTicketCents)}
            icon={<Wallet />}
            delta={
              <DeltaBadge bps={variazioneBps(attuale.averageTicketCents, prima.averageTicketCents)} />
            }
            hint="Valore medio per pratica"
          />
        )}
        <KpiCard
          label="Pratiche"
          value={String(attuale.bookingsCount)}
          icon={<Luggage />}
          delta={<DeltaBadge bps={variazioneBps(attuale.bookingsCount, prima.bookingsCount)} />}
          hint={`${attuale.confirmedCount} ${attuale.confirmedCount === 1 ? 'confermata o partita' : 'confermate o partite'}`}
        />
        <KpiCard
          label="Da incassare"
          value={formatEuro(attuale.receivableCents)}
          icon={<Banknote />}
          tone={attuale.overdueCents > 0 ? 'attention' : 'default'}
          delta={
            <DeltaBadge
              bps={variazioneBps(attuale.receivableCents, prima.receivableCents)}
              invertito
            />
          }
          hint={
            attuale.overdueCents > 0
              ? `di cui ${formatEuro(attuale.overdueCents)} già scaduti`
              : 'Nessun saldo scaduto'
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Andamento del periodo</CardTitle>
        </CardHeader>
        <CardContent>
          {conDati ? (
            <TrendChart points={mesi} />
          ) : (
            <EmptyState
              icon={<TrendingUp />}
              title="Nessuna partenza in questo periodo"
              description="Scegli un periodo diverso, oppure registra le pratiche con la loro data di partenza."
            />
          )}
        </CardContent>
      </Card>

      <section aria-label={ETICHETTE_VISTA[vista]} className="space-y-2">
        <p className="text-small text-text-muted">{DESCRIZIONI_VISTA[vista]}</p>
        {contenuto}
      </section>
    </div>
  )
}

/** Solo la vista richiesta viene interrogata: le altre non costano nulla. */
async function contenutoVista(vista: Vista, periodo: Periodo, mostraMargini: boolean) {
  if (vista === 'destinazioni') {
    const rows = await reportByDestination(periodo.from, periodo.to, LIMITE_DESTINAZIONI)
    return <VistaDestinazioni rows={rows} mostraMargini={mostraMargini} />
  }

  if (vista === 'fornitori') {
    const rows = await reportBySupplier(periodo.from, periodo.to)
    return <VistaFornitori rows={rows} />
  }

  const [rows, quotes] = await Promise.all([
    reportByOwner(periodo.from, periodo.to),
    reportQuotesByOwner(periodo.from, periodo.to),
  ])
  return <VistaOperatori rows={rows} quotes={quotes} mostraMargini={mostraMargini} />
}

function Scheletro({ mostraMargini }: { mostraMargini: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden={!mostraMargini}>
        {[0, 1, 2, 3].map((indice) => (
          <Skeleton key={indice} className="h-28 rounded-lg" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Andamento del periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
      <TableSkeleton rows={6} columns={6} />
    </div>
  )
}
