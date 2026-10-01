import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa preventivi' }

export default async function ImportaPreventiviPage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa preventivi"
        description="Porta dentro le proposte che stai ancora seguendo. Prima vedi l’anteprima, poi confermi."
      />

      {/* Le due cose che chi importa scopre solo dopo, se non gliele diciamo
          prima: il cliente deve esserci, e il numero cambia. */}
      <div className="rounded-lg border border-info-border bg-info-subtle p-4 text-small text-info-fg">
        <p className="font-semibold">Prima i clienti, poi i preventivi.</p>
        <p className="mt-1">
          Ogni preventivo indica il suo cliente con il nome, l’email, la partita IVA o il codice
          fiscale: se quel cliente non è ancora in anagrafica, la riga viene scartata e te lo dice.
          Importa prima l’anagrafica dalla pagina Clienti.
        </p>
        <p className="mt-2">
          I preventivi importati prendono la numerazione di questo gestionale. Il numero che avevano
          prima, se lo metti nella colonna «Numero di origine», resta scritto nelle note e si trova
          con la ricerca.
        </p>
      </div>

      <CsvImport entity="preventivi" title="File da importare" />
    </div>
  )
}
