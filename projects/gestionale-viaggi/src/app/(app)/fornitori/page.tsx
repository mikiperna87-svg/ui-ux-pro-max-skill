import { Download, Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { parseListParams } from '@/lib/list-params'
import { listSuppliers } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { SUPPLIER_LIST_OPTIONS } from './config'
import { FornitoriTabella } from './fornitori-tabella'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export const metadata: Metadata = { title: 'Fornitori' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function FornitoriPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, SUPPLIER_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Fornitori"
        description="Condizioni di pagamento, commissioni e marginalità di chi fattura all’agenzia."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/fornitori/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <EtichettaBottone>Esporta</EtichettaBottone>
              </a>
            </Button>
            {session.permissions.write ? (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/fornitori/importa" aria-label="Importa">
                    <Upload aria-hidden="true" />
                    <EtichettaBottone>Importa</EtichettaBottone>
                  </Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/fornitori/nuovo">
                    <Plus aria-hidden="true" />
                    Nuovo fornitore
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Suspense key={JSON.stringify(raw)} fallback={<TableSkeleton rows={10} columns={7} />}>
        <Elenco
          params={params}
          canWrite={session.permissions.write}
          showMargins={session.permissions.margins}
        />
      </Suspense>
    </div>
  )
}

async function Elenco({
  params,
  canWrite,
  showMargins,
}: {
  params: ReturnType<typeof parseListParams>
  canWrite: boolean
  showMargins: boolean
}) {
  const result = await listSuppliers(params)

  return (
    <FornitoriTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      canWrite={canWrite}
      showMargins={showMargins}
      hasFilters={params.search !== '' || Object.keys(params.filters).length > 0}
    />
  )
}
