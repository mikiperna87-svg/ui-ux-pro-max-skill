import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { operatorOptions } from '@/server/queries/pratiche'
import { getQuoteDetail } from '@/server/queries/preventivi'
import { requireSession } from '@/server/session'
import { PreventivoForm } from '../../preventivo-form'

export const metadata: Metadata = { title: 'Modifica preventivo' }

export default async function ModificaPreventivoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  if (!session.permissions.write) notFound()

  const { id } = await params
  const [detail, customers, operators] = await Promise.all([
    getQuoteDetail(id),
    customerOptions(),
    operatorOptions(),
  ])

  if (!detail) notFound()

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Modifica ${detail.quote.code}`}
        description="Il codice non cambia. Le proposte si modificano dalla scheda."
      />
      <PreventivoForm
        quote={detail.quote}
        customers={customers}
        operators={operators}
        defaultSaleType={session.settings.default_sale_type}
      />
    </div>
  )
}
