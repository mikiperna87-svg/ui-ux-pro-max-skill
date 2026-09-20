import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { operatorOptions } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { PreventivoForm } from '../preventivo-form'

export const metadata: Metadata = { title: 'Nuovo preventivo' }

export default async function NuovoPreventivoPage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const [customers, operators] = await Promise.all([customerOptions(), operatorOptions()])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nuovo preventivo"
        description="Prima il viaggio e le condizioni; le proposte da mettere a confronto si costruiscono subito dopo, nella scheda."
      />
      <PreventivoForm
        customers={customers}
        operators={operators}
        defaultSaleType={session.settings.default_sale_type}
      />
    </div>
  )
}
