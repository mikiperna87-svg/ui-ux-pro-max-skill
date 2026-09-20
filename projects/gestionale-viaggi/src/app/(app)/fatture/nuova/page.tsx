import type { Metadata } from 'next'
import { PageHeader } from '@/components/dashboard/page-header'
import { customerOptions } from '@/server/queries/anagrafiche'
import { bookingOptions } from '@/server/queries/fatture'
import { requirePermission } from '@/server/session'
import { FatturaForm } from '../fattura-form'

export const metadata: Metadata = { title: 'Nuova fattura' }

export default async function NuovaFatturaPage() {
  const session = await requirePermission('accounting')
  const [customers, bookings] = await Promise.all([customerOptions(), bookingOptions()])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Nuova fattura"
        description="Una fattura nasce quasi sempre da una pratica: dalla scheda della pratica le righe arrivano già compilate. Qui si scrive quella che non ha una pratica dietro."
      />
      <FatturaForm
        customers={customers}
        bookings={bookings}
        defaultVatRegime={
          session.settings.default_sale_type === 'organizzazione' ? 'art_74_ter' : 'ordinaria'
        }
      />
    </div>
  )
}
