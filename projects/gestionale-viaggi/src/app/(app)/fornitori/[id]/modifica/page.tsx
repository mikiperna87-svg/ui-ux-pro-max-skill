import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/server/session'
import { FornitoreForm } from '../../fornitore-form'

export const metadata: Metadata = { title: 'Modifica fornitore' }

export default async function ModificaFornitorePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const { id } = await params
  const supabase = await createClient()
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!supplier) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={supplier.name} description="Modifica della scheda fornitore." />
      <FornitoreForm supplier={supplier} />
    </div>
  )
}
