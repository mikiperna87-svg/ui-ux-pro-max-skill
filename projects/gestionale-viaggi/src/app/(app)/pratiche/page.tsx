import { Download, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import type { SavedView } from '@/components/data-table/saved-views'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { parseListParams } from '@/lib/list-params'
import { listBookings, operatorOptions } from '@/server/queries/pratiche'
import { savedViewsFor } from '@/server/queries/viste'
import { requireSession } from '@/server/session'
import { BOOKING_LIST_OPTIONS } from './config'
import { PraticheTabella } from './pratiche-tabella'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export const metadata: Metadata = { title: 'Pratiche' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PratichePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, BOOKING_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Pratiche"
        description="Il registro dei viaggi venduti: stato, scadenze, incassi e margine di ciascuna pratica."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/pratiche/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <EtichettaBottone>Esporta</EtichettaBottone>
              </a>
            </Button>
            {session.permissions.write ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/pratiche/nuova">
                  <Plus aria-hidden="true" />
                  Nuova pratica
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
    listBookings(params),
    operatorOptions(),
    savedViewsFor('pratiche'),
  ])

  return (
    <PraticheTabella
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
