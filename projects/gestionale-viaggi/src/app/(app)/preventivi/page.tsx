import { Download, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import type { SavedView } from '@/components/data-table/saved-views'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { parseListParams } from '@/lib/list-params'
import { listQuotes } from '@/server/queries/preventivi'
import { operatorOptions } from '@/server/queries/pratiche'
import { savedViewsFor } from '@/server/queries/viste'
import { requireSession } from '@/server/session'
import { QUOTE_LIST_OPTIONS } from './config'
import { PreventiviTabella } from './preventivi-tabella'

export const metadata: Metadata = { title: 'Preventivi' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PreventiviPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, QUOTE_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Preventivi"
        description="Le proposte mandate ai clienti: due o tre varianti a confronto, con la risposta che arriva dal collegamento."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/preventivi/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">Esporta</span>
              </a>
            </Button>
            {session.permissions.write ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/preventivi/nuovo">
                  <Plus aria-hidden="true" />
                  Nuovo preventivo
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <Suspense key={JSON.stringify(raw)} fallback={<TableSkeleton rows={10} columns={8} />}>
        <Elenco
          params={params}
          canWrite={session.permissions.write}
          showMargins={session.permissions.margins}
          canShareViews={session.membership.role === 'titolare'}
        />
      </Suspense>
    </div>
  )
}

async function Elenco({
  params,
  canWrite,
  showMargins,
  canShareViews,
}: {
  params: ReturnType<typeof parseListParams>
  canWrite: boolean
  showMargins: boolean
  canShareViews: boolean
}) {
  const [result, operators, views] = await Promise.all([
    listQuotes(params),
    operatorOptions(),
    savedViewsFor('preventivi'),
  ])

  return (
    <PreventiviTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      operators={operators}
      views={views as readonly SavedView[]}
      canWrite={canWrite}
      canShareViews={canShareViews}
      showMargins={showMargins}
      hasFilters={params.search !== '' || Object.keys(params.filters).length > 0}
    />
  )
}
