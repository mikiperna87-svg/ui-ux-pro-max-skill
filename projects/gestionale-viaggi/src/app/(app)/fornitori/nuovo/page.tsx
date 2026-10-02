import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireSession } from '@/server/session'
import { FornitoreForm } from '../fornitore-form'

export const metadata: Metadata = { title: 'Nuovo fornitore' }

export default async function NuovoFornitorePage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nuovo fornitore"
        description="Condizioni di pagamento e commissione vengono proposte su ogni servizio di questo fornitore."
      />
      <FornitoreForm />
    </div>
  )
}
