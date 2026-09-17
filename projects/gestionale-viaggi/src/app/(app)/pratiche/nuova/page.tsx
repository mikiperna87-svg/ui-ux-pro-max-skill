import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { operatorOptions } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { PraticaForm } from '../pratica-form'

export const metadata: Metadata = { title: 'Nuova pratica' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function NuovaPraticaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const raw = await searchParams
  const cliente = typeof raw.cliente === 'string' ? raw.cliente : undefined
  const [customers, operators] = await Promise.all([customerOptions(), operatorOptions()])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nuova pratica"
        description="Il codice viene assegnato al salvataggio, in ordine e senza buchi. Servizi, passeggeri e scadenze si aggiungono dopo."
      />
      <PraticaForm
        customers={customers}
        operators={operators}
        defaultCustomerId={cliente}
        defaultSaleType={session.settings.default_sale_type}
      />
    </div>
  )
}
