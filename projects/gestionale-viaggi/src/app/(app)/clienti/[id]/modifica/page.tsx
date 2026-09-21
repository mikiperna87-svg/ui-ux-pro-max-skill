import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/server/session'
import { ClienteForm } from '../../cliente-form'

export const metadata: Metadata = { title: 'Modifica cliente' }

export default async function ModificaClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const { id } = await params
  const supabase = await createClient()
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!customer) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={customer.display_name ?? 'Cliente'}
        description="Modifica della scheda cliente."
      />
      <ClienteForm customer={customer} />
    </div>
  )
}
