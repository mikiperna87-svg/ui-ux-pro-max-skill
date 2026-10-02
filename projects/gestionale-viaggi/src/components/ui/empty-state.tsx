import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  readonly icon?: ReactNode
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
  readonly className?: string
}

/**
 * Stato vuoto progettato: dice che cosa manca, perché, e che cosa fare adesso.
 * Mai una tabella vuota senza spiegazione.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="flex size-11 items-center justify-center rounded-full bg-surface text-text-subtle shadow-e1 [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-heading text-text">{title}</p>
        <p className="mx-auto max-w-sm text-small text-text-muted">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
