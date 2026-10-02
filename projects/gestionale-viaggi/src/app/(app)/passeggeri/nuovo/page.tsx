import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { PasseggeroForm } from '../passeggero-form'

export const metadata: Metadata = { title: 'Nuovo passeggero' }

export default async function NuovoPasseggeroPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const [{ cliente }, customers] = await Promise.all([searchParams, customerOptions()])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nuovo passeggero"
        description="Registra una volta documento ed esigenze: li ritrovi in ogni pratica futura."
      />
      <PasseggeroForm customers={customers} defaultCustomerId={cliente} />
    </div>
  )
}
