import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KpiCardProps {
  readonly label: string
  readonly value: string
  readonly hint?: string
  readonly icon?: ReactNode
  readonly tone?: 'default' | 'positive' | 'attention' | 'critical'
}

const toneStyles = {
  default: 'text-text',
  positive: 'text-success',
  attention: 'text-warning',
  critical: 'text-danger',
} as const

/** Indicatore singolo: numero grande e tabulare, etichetta sopra, contesto sotto. */
export function KpiCard({ label, value, hint, icon, tone = 'default' }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">{label}</p>
        {icon ? <span className="text-text-subtle [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p className={cn('mt-2 num text-[1.625rem] font-semibold leading-none tracking-tight', toneStyles[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-caption text-text-muted">{hint}</p> : null}
    </div>
  )
}
