import type { Metadata } from 'next'
import { ReimpostaForm } from './reimposta-form'

export const metadata: Metadata = { title: 'Nuova password' }

export default function ReimpostaPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-title text-text">Imposta una nuova password</h1>
        <p className="text-small text-text-muted">
          Sceglila lunga: e l’unica chiave dei dati dei tuoi clienti.
        </p>
      </header>
      <ReimpostaForm />
    </div>
  )
}
