import type { Metadata } from 'next'
import { FormMessage } from '@/components/forms/form-message'
import { AccediForm } from './accedi-form'

export const metadata: Metadata = { title: 'Accedi' }

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ successivo?: string; disconnesso?: string }>
}) {
  const params = await searchParams
  const successivo =
    params.successivo && params.successivo.startsWith('/') && !params.successivo.startsWith('//')
      ? params.successivo
      : '/'

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-title text-text">Accedi al gestionale</h1>
        <p className="text-small text-text-muted">
          Entra con le credenziali dell’agenzia per riprendere il lavoro.
        </p>
      </header>

      {params.disconnesso === 'tutti' ? (
        <FormMessage
          status="success"
          message="Sei stato disconnesso da tutti i dispositivi."
        />
      ) : null}

      <AccediForm successivo={successivo} />
    </div>
  )
}
