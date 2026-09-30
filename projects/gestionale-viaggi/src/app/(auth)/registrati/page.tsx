import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { codiceRegistrazione } from '@/lib/registrazione'
import { getSession } from '@/server/session'
import { RegistratiForm } from './registrati-form'

export const metadata: Metadata = { title: 'Crea la tua agenzia' }

export default async function RegistratiPage() {
  // Il rimbalzo che il middleware non puo' fare: li' servirebbe una query a
  // ogni richiesta, qui basta su questa pagina. Chi ha gia' un'agenzia viva
  // torna alla panoramica; chi ha solo un account resta e la crea.
  if (await getSession()) redirect('/')

  // Letto sul server: il codice non passa mai dal browser, solo il fatto che
  // ne serva uno.
  const serveCodice = codiceRegistrazione() !== null

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-title text-text">Crea la tua agenzia</h1>
        <p className="text-small text-text-muted">
          {serveCodice
            ? 'Serve il codice di invito ricevuto da chi gestisce il gestionale. Diventi il titolare della tua agenzia: potrai invitare collaboratori e assegnare i ruoli.'
            : 'Diventi il titolare: potrai invitare collaboratori e assegnare i ruoli.'}
        </p>
      </header>
      <RegistratiForm serveCodice={serveCodice} />
    </div>
  )
}
