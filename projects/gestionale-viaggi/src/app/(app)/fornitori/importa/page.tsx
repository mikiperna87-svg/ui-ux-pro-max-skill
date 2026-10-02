import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa fornitori' }

export default async function ImportaFornitoriPage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa fornitori"
        description="Condizioni di pagamento e commissioni vengono lette dal file, se presenti."
      />
      <CsvImport entity="fornitori" title="File da importare" />
    </div>
  )
}
