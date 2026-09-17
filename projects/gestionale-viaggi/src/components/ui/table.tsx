import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Primitive di tabella dense e leggibili: intestazione fissa, riga in evidenza
 * al passaggio del mouse, numeri sempre tabulari.
 */
export function TableWrapper({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('overflow-x-auto rounded-lg border border-border bg-surface shadow-e1', className)}
      {...props}
    />
  )
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return <table className={cn('w-full border-collapse text-small', className)} {...props} />
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn('sticky top-0 z-10 bg-surface-2 text-text-muted [&_th]:border-b [&_th]:border-border', className)}
      {...props}
    />
  )
}

export function TableHeaderCell({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150 hover:bg-surface-hover data-[selected=true]:bg-accent-subtle',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle text-text', className)} {...props} />
}

/** Cella numerica: allineata a destra e con cifre a larghezza fissa. */
export function TableCellNumeric({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 text-right align-middle num text-text', className)} {...props} />
}
