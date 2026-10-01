import type { Metadata } from 'next'
import { FormMessage } from '@/components/forms/form-message'
import { AccediForm } from './accedi-form'
import { EntraInDemo } from './entra-in-demo'

export const metadata: Metadata = { title: 'Accedi' }

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ successivo?: string; disconnesso?: string }>
}) {
  // La demo compare solo dove è configurata: un'installazione di un'agenzia
  // vera non deve mostrare un invito a entrare in casa d'altri.
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL
  const demoPassword = process.env.NEXT_PUBLIC_DEMO_PASSWORD
  const demo = demoEmail && demoPassword ? { email: demoEmail, password: demoPassword } : null

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

      {demo ? <EntraInDemo email={demo.email} password={demo.password} /> : null}
    </div>
  )
}
