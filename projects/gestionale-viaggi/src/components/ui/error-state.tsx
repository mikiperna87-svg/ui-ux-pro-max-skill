'use client'

import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  readonly title?: string
  readonly description: string
  readonly onRetry?: () => void
  readonly retryLabel?: string
  readonly className?: string
}

/** Errore leggibile con possibilità di riprovare. Mai uno stack trace in faccia all’utente. */
export function ErrorState({
  title = 'Non siamo riusciti a caricare i dati',
  description,
  onRetry,
  retryLabel = 'Riprova',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-subtle bg-danger-subtle/40 px-6 py-10 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-surface text-danger shadow-e1">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-heading text-text">{title}</p>
        <p className="mx-auto max-w-md text-small text-text-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
