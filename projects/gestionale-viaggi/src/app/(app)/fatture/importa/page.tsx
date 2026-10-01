import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { CsvImport } from '@/components/data-table/csv-import'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Importa documenti pregressi' }

export default async function ImportaFatturePage() {
  const session = await requireSession()
  // Importare documenti fiscali non è «scrivere»: serve il permesso contabile.
  if (!session.permissions.accounting) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Importa documenti pregressi"
        description="Le fatture e le note di credito già emesse dal gestionale precedente, con il loro numero e la loro data."
      />

      {/* Le tre cose che un'agenzia deve sapere prima di premere, non dopo. */}
      <div className="rounded-lg border border-info-border bg-info-subtle p-4 text-small text-info-fg">
        <p className="font-semibold">Il numero resta quello di prima.</p>
        <p className="mt-1">
          Ogni documento conserva il numero e la data che aveva: l’estratto conto del cliente e il
          registro IVA tornano con quelli del commercialista. La numerazione di questo gestionale
          riparte dal numero più alto che importi, così la prima fattura nuova non riusa un numero
          già speso.
        </p>
        <p className="mt-2 font-semibold">Non vengono ritrasmessi allo SdI.</p>
        <p className="mt-1">
          Un documento importato era già stato trasmesso dal gestionale di prima: rimandarlo
          significherebbe depositarlo due volte all’Agenzia delle Entrate. Il gestionale non lo
          permette, nemmeno per errore.
        </p>
        <p className="mt-2 font-semibold">Una riga per voce.</p>
        <p className="mt-1">
          Più righe con lo stesso numero e la stessa data fanno un documento solo, con tutte le sue
          voci. Il cliente va indicato con il nome, l’email, la partita IVA o il codice fiscale, e
          deve essere già in anagrafica.
        </p>
      </div>

      {/* Chi ha già dichiarato quei mesi non deve importarli: il registro IVA li
          sommerebbe a quelli del gestionale di prima. Dirlo qui costa una riga;
          scoprirlo a liquidazione fatta costa una comunicazione di variazione. */}
      <div className="rounded-lg border border-warning-border bg-warning-subtle p-4 text-small text-warning-fg">
        <p className="font-semibold">Attenzione ai mesi già dichiarati.</p>
        <p className="mt-1">
          I documenti importati entrano nel registro IVA del mese della loro data di emissione. Se
          quei mesi li hai già liquidati con il gestionale precedente, importa solo i documenti
          ancora da incassare: il registro di questo gestionale deve coprire i periodi che dichiari
          da qui in avanti.
        </p>
      </div>

      <CsvImport entity="fatture" title="File da importare" />
    </div>
  )
}
