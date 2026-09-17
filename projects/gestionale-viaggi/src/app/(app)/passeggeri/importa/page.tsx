import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa passeggeri' }

export default async function ImportaPasseggeriPage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa passeggeri"
        description="Utile per i gruppi: un elenco di nomi con documenti diventa anagrafica in un passaggio."
      />
      <CsvImport entity="passeggeri" title="File da importare" />
    </div>
  )
}
