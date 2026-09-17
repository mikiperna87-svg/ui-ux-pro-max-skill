import { Download, Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { parseListParams } from '@/lib/list-params'
import { listPassengers } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { PASSENGER_LIST_OPTIONS } from './config'
import { PasseggeriTabella } from './passeggeri-tabella'

export const metadata: Metadata = { title: 'Passeggeri' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function PasseggeriPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, PASSENGER_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Passeggeri"
        description="Chi viaggia davvero: documenti, scadenze ed esigenze particolari, pronti per la prossima pratica."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/passeggeri/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">Esporta</span>
              </a>
            </Button>
            {session.permissions.write ? (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/passeggeri/importa" aria-label="Importa">
                    <Upload aria-hidden="true" />
                    <span className="hidden sm:inline">Importa</span>
                  </Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/passeggeri/nuovo">
                    <Plus aria-hidden="true" />
                    Nuovo passeggero
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Suspense key={JSON.stringify(raw)} fallback={<TableSkeleton rows={10} columns={6} />}>
        <Elenco params={params} canWrite={session.permissions.write} />
      </Suspense>
    </div>
  )
}

async function Elenco({
  params,
  canWrite,
}: {
  params: ReturnType<typeof parseListParams>
  canWrite: boolean
}) {
  const result = await listPassengers(params)

  return (
    <PasseggeriTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      canWrite={canWrite}
      hasFilters={params.search !== '' || Object.keys(params.filters).length > 0}
    />
  )
}
