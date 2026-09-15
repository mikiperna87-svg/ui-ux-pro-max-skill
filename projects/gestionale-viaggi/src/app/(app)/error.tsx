'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/error-state'

/**
 * Confine di errore della sezione applicativa: un guasto in una pagina non
 * abbatte la navigazione, e l’utente può riprovare senza ricaricare tutto.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Il dettaglio finisce nei log del server, non davanti all’utente.
    console.error('Errore nella sezione applicativa:', error.message, error.digest)
  }, [error])

  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorState
        description="Si è verificato un errore durante il caricamento di questa sezione. Se il problema si ripete, segnala il codice riportato qui sotto all’assistenza."
        onRetry={reset}
      />
      {error.digest ? (
        <p className="mt-3 text-center text-caption text-text-subtle">
          Codice errore: <span className="num">{error.digest}</span>
        </p>
      ) : null}
    </div>
  )
}
