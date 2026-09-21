import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { requireSession } from '@/server/session'
import { ClienteForm } from '../cliente-form'

export const metadata: Metadata = { title: 'Nuovo cliente' }

export default async function NuovoClientePage() {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Nuovo cliente"
        description="I campi fiscali servono per la fatturazione: si possono completare anche più tardi."
      />
      <ClienteForm />
    </div>
  )
}
