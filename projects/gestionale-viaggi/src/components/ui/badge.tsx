import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-text-muted',
        accent: 'border-accent-border bg-accent-subtle text-accent-subtle-fg',
        success: 'border-transparent bg-success-subtle text-success-fg',
        warning: 'border-transparent bg-warning-subtle text-warning-fg',
        danger: 'border-transparent bg-danger-subtle text-danger-fg',
        info: 'border-transparent bg-info-subtle text-info-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

const dotColors = {
  neutral: 'bg-text-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
} as const

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Pallino colorato: il colore non è mai l’unico portatore di significato. */
  readonly dot?: boolean
}

export function Badge({ className, tone = 'neutral', dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', dotColors[tone ?? 'neutral'])}
        />
      ) : null}
      {children}
    </span>
  )
}
