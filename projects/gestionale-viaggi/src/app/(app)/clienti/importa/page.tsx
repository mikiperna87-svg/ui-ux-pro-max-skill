import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa clienti' }

export default async function ImportaClientiPage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa clienti"
        description="Porta dentro l’anagrafica che usi oggi. Prima vedi l’anteprima, poi confermi."
      />
      <CsvImport entity="clienti" title="File da importare" />
    </div>
  )
}
