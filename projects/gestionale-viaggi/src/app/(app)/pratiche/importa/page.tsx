import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa pratiche' }

export default async function ImportaPratichePage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa pratiche"
        description="Porta dentro il lavoro che hai già fatto. Prima vedi l’anteprima, poi confermi."
      />

      {/* L'ordine non è un consiglio: una pratica senza il suo cliente in
          anagrafica viene scartata, e scoprirlo a metà file fa perdere tempo. */}
      <div className="rounded-lg border border-info-border bg-info-subtle p-4 text-small text-info-fg">
        <p className="font-semibold">Prima i clienti, poi le pratiche.</p>
        <p className="mt-1">
          Ogni pratica indica il suo cliente con il nome, l’email, la partita IVA o il codice
          fiscale: se quel cliente non è ancora in anagrafica, la riga viene scartata e te lo dice.
          Importa prima l’anagrafica dalla pagina Clienti.
        </p>
      </div>

      <CsvImport entity="pratiche" title="File da importare" />
    </div>
  )
}
