import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { createClient } from '@/lib/supabase/server'
import { customerOptions } from '@/server/queries/anagrafiche'
import { requireSession } from '@/server/session'
import { PasseggeroForm } from '../../passeggero-form'

export const metadata: Metadata = { title: 'Modifica passeggero' }

export default async function ModificaPasseggeroPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const { id } = await params
  const supabase = await createClient()
  const [{ data: passenger }, customers] = await Promise.all([
    supabase.from('passengers').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    customerOptions(),
  ])

  if (!passenger) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title={passenger.full_name ?? 'Passeggero'} description="Modifica della scheda passeggero." />
      <PasseggeroForm passenger={passenger} customers={customers} />
    </div>
  )
}
