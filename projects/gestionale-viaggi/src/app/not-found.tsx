import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 text-center shadow-e2">
        <p className="num text-caption font-semibold uppercase tracking-wide text-text-subtle">Errore 404</p>
        <h1 className="text-title text-text">Pagina non trovata</h1>
        <p className="text-small text-text-muted">
          L’indirizzo non esiste oppure non hai i permessi per vederlo. Se pensi sia un errore,
          chiedi al titolare dell’agenzia di verificare il tuo ruolo.
        </p>
        <Button asChild variant="primary">
          <Link href="/">Torna alla panoramica</Link>
        </Button>
      </div>
    </div>
  )
}
