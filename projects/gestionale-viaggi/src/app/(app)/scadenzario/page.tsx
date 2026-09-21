import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { parseListParams } from '@/lib/list-params'
import { cn } from '@/lib/utils'
import {
  listInstallments,
  listPayouts,
  supplierFilterOptions,
  totaliScadenzario,
} from '@/server/queries/incassi'
import { operatorOptions } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import {
  INSTALLMENT_LIST_OPTIONS,
  PAYOUT_LIST_OPTIONS,
  sezioneDa,
  type Sezione,
} from './config'
import { PagamentiTabella } from './pagamenti-tabella'
import { RateTabella } from './rate-tabella'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export const metadata: Metadata = { title: 'Scadenzario' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ScadenzarioPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const sezione = sezioneDa(raw.sezione)

  const query = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  )
  query.set('sezione', sezione)
  const exportQuery = query.toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Scadenzario"
        description="Che cosa deve entrare in cassa e che cosa deve uscire, con il ritardo in evidenza."
        actions={
          <Button asChild variant="secondary" size="sm">
            <a href={`/scadenzario/esporta?${exportQuery}`} aria-label="Esporta">
              <Download aria-hidden="true" />
              <EtichettaBottone>Esporta</EtichettaBottone>
            </a>
          </Button>
        }
      />

      <Suspense fallback={<TotaliScheletro />}>
        <Totali />
      </Suspense>

      <SelettoreSezione sezione={sezione} parametri={raw} />

      <Suspense key={`${sezione}-${JSON.stringify(raw)}`} fallback={<TableSkeleton rows={10} columns={7} />}>
        {sezione === 'incassi' ? (
          <ElencoRate raw={raw} canManage={session.permissions.accounting} />
        ) : (
          <ElencoPagamenti raw={raw} canManage={session.permissions.accounting} />
        )}
      </Suspense>
    </div>
  )
}

/**
 * Le due schede sono due indirizzi, non due stati di un componente: chi manda
 * "i pagamenti in ritardo" a un collega manda un collegamento che si apre già
 * sulla scheda giusta.
 */
function SelettoreSezione({
  sezione,
  parametri,
}: {
  sezione: Sezione
  parametri: Record<string, string | string[] | undefined>
}) {
  const href = (destinazione: Sezione) => {
    const params = new URLSearchParams(
      Object.entries(parametri).flatMap(([key, value]) =>
        typeof value === 'string' && key !== 'sezione' && key !== 'pagina' && key !== 'ordina'
          ? [[key, value] as [string, string]]
          : [],
      ),
    )
    params.set('sezione', destinazione)
    return `/scadenzario?${params.toString()}`
  }

  const voci: ReadonlyArray<{ chiave: Sezione; etichetta: string; icona: typeof ArrowDownLeft }> = [
    { chiave: 'incassi', etichetta: 'Da incassare', icona: ArrowDownLeft },
    { chiave: 'pagamenti', etichetta: 'Da pagare', icona: ArrowUpRight },
  ]

  return (
    <nav aria-label="Sezione dello scadenzario" className="flex w-fit gap-1 rounded-lg bg-surface-2 p-1">
      {voci.map((voce) => (
        <Link
          key={voce.chiave}
          href={href(voce.chiave)}
          aria-current={voce.chiave === sezione ? 'page' : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-small font-medium transition-colors duration-150',
            voce.chiave === sezione
              ? 'bg-surface text-text shadow-e1'
              : 'text-text-muted hover:text-text',
          )}
        >
          <voce.icona className="size-3.5" aria-hidden="true" />
          {voce.etichetta}
        </Link>
      ))}
    </nav>
  )
}

async function Totali() {
  const totali = await totaliScadenzario()

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Da incassare"
        value={formatEuro(totali.daIncassareCents)}
        hint="Residuo di tutte le scadenze aperte"
        icon={<ArrowDownLeft />}
      />
      <KpiCard
        label="Incassi in ritardo"
        value={formatEuro(totali.inRitardoCents)}
        hint={
          totali.inRitardoCount === 0
            ? 'Nessuna scadenza scoperta'
            : `${plurale(totali.inRitardoCount, 'scadenza scoperta', 'scadenze scoperte')}`
        }
        icon={<AlertTriangle />}
        tone={totali.inRitardoCents > 0 ? 'critical' : 'default'}
      />
      <KpiCard
        label="Da pagare"
        value={formatEuro(totali.daPagareCents)}
        hint="Fornitori ancora da saldare"
        icon={<ArrowUpRight />}
      />
      <KpiCard
        label="Pagamenti in ritardo"
        value={formatEuro(totali.pagamentiInRitardoCents)}
        hint={
          totali.pagamentiInRitardoCount === 0
            ? 'Nessun fornitore in attesa oltre la scadenza'
            : `${plurale(totali.pagamentiInRitardoCount, 'pagamento scaduto', 'pagamenti scaduti')}`
        }
        icon={<AlertTriangle />}
        tone={totali.pagamentiInRitardoCents > 0 ? 'attention' : 'default'}
      />
    </div>
  )
}

function TotaliScheletro() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

async function ElencoRate({
  raw,
  canManage,
}: {
  raw: Record<string, string | string[] | undefined>
  canManage: boolean
}) {
  const params = parseListParams(raw, INSTALLMENT_LIST_OPTIONS)
  const [result, operators] = await Promise.all([listInstallments(params), operatorOptions()])

  return (
    <RateTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      operators={operators}
      canManage={canManage}
      hasFilters={params.search !== '' || Object.keys(params.filters).some((key) => key !== 'sezione')}
    />
  )
}

async function ElencoPagamenti({
  raw,
  canManage,
}: {
  raw: Record<string, string | string[] | undefined>
  canManage: boolean
}) {
  const params = parseListParams(raw, PAYOUT_LIST_OPTIONS)
  const [result, suppliers] = await Promise.all([listPayouts(params), supplierFilterOptions()])

  return (
    <PagamentiTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      suppliers={suppliers}
      canManage={canManage}
      hasFilters={params.search !== '' || Object.keys(params.filters).some((key) => key !== 'sezione')}
    />
  )
}
