import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KpiCardProps {
  readonly label: string
  readonly value: string
  readonly hint?: string
  readonly icon?: ReactNode
  readonly tone?: 'default' | 'positive' | 'attention' | 'critical'
  /** Variazione rispetto a un altro periodo, mostrata sotto il numero. */
  readonly delta?: ReactNode
}

const toneStyles = {
  default: 'text-text',
  positive: 'text-success',
  attention: 'text-warning',
  critical: 'text-danger',
} as const

/** Indicatore singolo: numero grande e tabulare, etichetta sopra, contesto sotto. */
export function KpiCard({ label, value, hint, icon, tone = 'default', delta }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">{label}</p>
        {icon ? <span className="text-text-subtle [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p className={cn('mt-2 num text-[1.625rem] font-semibold leading-none tracking-tight', toneStyles[tone])}>
        {value}
      </p>
      {delta ? <p className="mt-2">{delta}</p> : null}
      {hint ? <p className="mt-1.5 text-caption text-text-muted">{hint}</p> : null}
    </div>
  )
}
