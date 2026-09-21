import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Link non valido' }

const MOTIVI: Record<string, string> = {
  'link-scaduto': 'Il link è scaduto oppure è già stato usato. I link di accesso valgono una sola volta.',
  'codice-mancante': 'Il link non contiene le informazioni necessarie. Può succedere se è stato troncato dal programma di posta.',
}

export default async function AuthErrorePage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>
}) {
  const { motivo } = await searchParams
  const descrizione = MOTIVI[motivo ?? ''] ?? 'Non siamo riusciti a completare l’accesso.'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-e2">
        <h1 className="text-title text-text">Link non valido</h1>
        <p className="text-small text-text-muted">{descrizione}</p>
        <Button asChild variant="primary">
          <Link href="/accedi">Torna all’accesso</Link>
        </Button>
      </div>
    </div>
  )
}
