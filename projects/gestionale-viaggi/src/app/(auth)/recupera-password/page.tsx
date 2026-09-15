import type { Metadata } from 'next'
import Link from 'next/link'
import { RecuperaForm } from './recupera-form'

export const metadata: Metadata = { title: 'Recupera la password' }

export default function RecuperaPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-title text-text">Recupera la password</h1>
        <p className="text-small text-text-muted">
          Inserisci la tua email: ti inviamo un link per impostarne una nuova.
        </p>
      </header>
      <RecuperaForm />
      <p className="text-center text-small text-text-muted">
        <Link href="/accedi" className="text-accent underline-offset-4 hover:underline">
          Torna all’accesso
        </Link>
      </p>
    </div>
  )
}
