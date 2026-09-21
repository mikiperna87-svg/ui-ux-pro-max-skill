import type { Metadata } from 'next'
import { RegistratiForm } from './registrati-form'

export const metadata: Metadata = { title: 'Crea la tua agenzia' }

export default function RegistratiPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-title text-text">Crea la tua agenzia</h1>
        <p className="text-small text-text-muted">
          Diventi il titolare: potrai invitare collaboratori e assegnare i ruoli.
        </p>
      </header>
      <RegistratiForm />
    </div>
  )
}
