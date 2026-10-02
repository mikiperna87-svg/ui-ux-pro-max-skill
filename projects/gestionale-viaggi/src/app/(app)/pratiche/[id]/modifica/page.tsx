import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { getBookingDetail, operatorOptions } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { PraticaForm } from '../../pratica-form'

export const metadata: Metadata = { title: 'Modifica pratica' }

export default async function ModificaPraticaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const { id } = await params
  const [detail, customers, operators] = await Promise.all([
    getBookingDetail(id),
    customerOptions(),
    operatorOptions(),
  ])
  if (!detail) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Modifica ${detail.booking.code}`}
        description="Il codice della pratica non cambia mai: identifica il viaggio in contabilità e nei documenti."
      />
      <PraticaForm
        booking={detail.booking}
        customers={customers}
        operators={operators}
        defaultSaleType={session.settings.default_sale_type}
      />
    </div>
  )
}
