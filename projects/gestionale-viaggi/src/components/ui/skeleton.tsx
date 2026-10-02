import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Scheletro di caricamento: riproduce la forma del contenuto in arrivo.
 * Non usiamo spinner centrati, che nascondono il layout e fanno percepire
 * l’attesa come più lunga.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'rounded-md bg-surface-2',
        'bg-[linear-gradient(90deg,var(--color-surface-2)_25%,var(--color-surface-hover)_37%,var(--color-surface-2)_63%)]',
        'bg-[length:400%_100%] animate-[var(--animate-shimmer)]',
        className,
      )}
      {...props}
    />
  )
}

/** Scheletro di una tabella: stesse colonne e altezze della tabella reale. */
export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface" role="status" aria-label="Caricamento in corso">
      <div className="flex gap-4 border-b border-border bg-surface-2 px-4 py-2.5">
        {Array.from({ length: columns }).map((_unused, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_unused, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_unusedColumn, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className="h-3.5 flex-1"
              style={{ opacity: 1 - rowIndex * 0.06 }}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
