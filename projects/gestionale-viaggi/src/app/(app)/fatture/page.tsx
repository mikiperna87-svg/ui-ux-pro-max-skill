import { Download, Plus, Table2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
import { plurale } from '@/lib/labels'
import { parseListParams } from '@/lib/list-params'
import { formatEuro } from '@/lib/money'
import { listInvoices, totaliFatture } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'
import { INVOICE_LIST_OPTIONS } from './config'
import { FattureTabella } from './fatture-tabella'

export const metadata: Metadata = { title: 'Fatture' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function FatturePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, INVOICE_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Fatture"
        description="Fatture e note di credito emesse dall’agenzia. Il numero si assegna all’emissione: una bozza non consuma la numerazione."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/registri">
                <Table2 aria-hidden="true" />
                <span className="hidden sm:inline">Registro IVA</span>
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/fatture/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">Esporta</span>
              </a>
            </Button>
            {session.permissions.accounting ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/fatture/nuova">
                  <Plus aria-hidden="true" />
                  Nuova fattura
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/*
        Un solo confine di sospensione per pagina, attorno all'area dati: con
        più confini fratelli il router di Next perde la navigazione (DECISIONI 41).
      */}
      <Suspense key={JSON.stringify(raw)} fallback={<Scheletro />}>
        <Corpo params={params} canWrite={session.permissions.accounting} />
      </Suspense>
    </div>
  )
}

function Scheletro() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <Skeleton key={indice} className="h-24 rounded-lg" />
        ))}
      </div>
      <TableSkeleton rows={10} columns={8} />
    </div>
  )
}

async function Corpo({
  params,
  canWrite,
}: {
  params: ReturnType<typeof parseListParams>
  canWrite: boolean
}) {
  const [result, totali] = await Promise.all([listInvoices(params), totaliFatture(params)])

  // Gli anni del filtro vengono da ciò che esiste davvero: un menu con anni
  // vuoti è un menu che mente.
  const anni = [
    ...new Set(
      result.rows
        .map((riga) => riga.year)
        .filter((anno): anno is number => typeof anno === 'number'),
    ),
  ].sort((a, b) => b - a)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Documenti"
          value={String(totali.documenti)}
          hint={plurale(totali.documenti, 'documento nella selezione', 'documenti nella selezione')}
        />
        <KpiCard
          label="Imponibile"
          value={formatEuro(totali.imponibile)}
          hint="Note di credito già sottratte"
        />
        <KpiCard label="IVA" value={formatEuro(totali.iva)} hint="Imposta sulle vendite" />
        <KpiCard
          label="Da incassare"
          value={formatEuro(totali.daIncassare)}
          hint="Residuo delle fatture emesse"
          tone={totali.daIncassare > 0 ? 'attention' : 'default'}
        />
      </div>

      <FattureTabella
        rows={result.rows}
        total={result.total}
        page={result.page}
        perPage={result.perPage}
        pageCount={result.pageCount}
        sort={params.sort}
        direction={params.direction}
        anni={anni}
        canWrite={canWrite}
        hasFilters={params.search !== '' || Object.keys(params.filters).length > 0}
      />
    </div>
  )
}
