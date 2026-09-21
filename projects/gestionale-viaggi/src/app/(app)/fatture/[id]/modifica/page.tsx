import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { bookingOptions, getInvoiceDetail } from '@/server/queries/fatture'
import { requirePermission } from '@/server/session'
import { FatturaForm } from '../../fattura-form'

export const metadata: Metadata = { title: 'Modifica fattura' }

export default async function ModificaFatturaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission('accounting')
  const { id } = await params
  const detail = await getInvoiceDetail(id)

  if (!detail) notFound()

  // Un documento emesso non si modifica: si storna con una nota di credito.
  // La pagina non si apre nemmeno, invece di mostrare un modulo che al
  // salvataggio darebbe errore.
  if (detail.invoice.status !== 'bozza') redirect(`/fatture/${id}`)

  const [customers, bookings] = await Promise.all([customerOptions(), bookingOptions()])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Modifica la bozza"
        description="Finché è una bozza si cambia tutto. Dopo l’emissione il documento è fermo."
      />
      <FatturaForm
        invoice={detail.invoice}
        customers={customers}
        bookings={bookings}
        defaultVatRegime={detail.invoice.vat_regime}
      />
    </div>
  )
}
