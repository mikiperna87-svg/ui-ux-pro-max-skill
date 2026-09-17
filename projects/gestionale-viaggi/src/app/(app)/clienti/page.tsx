import { Download, Plus, Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/ui/skeleton'
import { parseListParams } from '@/lib/list-params'
import { customerTags, listCustomers } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { ClientiTabella } from './clienti-tabella'
import { CUSTOMER_LIST_OPTIONS } from './config'

export const metadata: Metadata = { title: 'Clienti' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ClientiPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams
  const params = parseListParams(raw, CUSTOMER_LIST_OPTIONS)
  const exportQuery = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value] as [string, string]] : [],
    ),
  ).toString()

  return (
    <div className="mx-auto max-w-[110rem] space-y-5">
      <PageHeader
        title="Clienti"
        description="Anagrafica dei clienti dell’agenzia, con storico dei viaggi e valore generato."
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/clienti/esporta${exportQuery ? `?${exportQuery}` : ''}`}
                aria-label="Esporta"
              >
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">Esporta</span>
              </a>
            </Button>
            {session.permissions.write ? (
              <>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/clienti/importa" aria-label="Importa">
                    <Upload aria-hidden="true" />
                    <span className="hidden sm:inline">Importa</span>
                  </Link>
                </Button>
                <Button asChild variant="primary" size="sm">
                  <Link href="/clienti/nuovo">
                    <Plus aria-hidden="true" />
                    Nuovo cliente
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
  const [result, tags] = await Promise.all([listCustomers(params), customerTags()])

  return (
    <ClientiTabella
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      pageCount={result.pageCount}
      sort={params.sort}
      direction={params.direction}
      tags={tags}
      canWrite={canWrite}
      showMargins={showMargins}
      hasFilters={params.search !== '' || Object.keys(params.filters).length > 0}
    />
  )
}
