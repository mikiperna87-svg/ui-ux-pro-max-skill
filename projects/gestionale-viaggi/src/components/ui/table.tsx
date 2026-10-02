import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Primitive di tabella dense e leggibili: intestazione fissa, riga in evidenza
 * al passaggio del mouse, numeri sempre tabulari.
 */
/**
 * Il contenitore di una tabella, che su schermo stretto scorre in orizzontale.
 *
 * `label` serve alle tabelle di sola lettura — quelle senza collegamenti né
 * comandi nelle celle, come i report e il registro IVA. In quelle, l'unico
 * modo di leggere le colonne di destra è far scorrere il riquadro, e senza
 * nulla di focalizzabile dentro chi usa solo la tastiera non può farlo: il
 * riquadro diventa allora una regione con un nome e una sosta nel giro di
 * tabulazione. Dove le celle contengono collegamenti la sosta esiste già, e
 * aggiungerne un'altra sarebbe soltanto rumore.
 */
export function TableWrapper({
  className,
  label,
  ...props
}: ComponentProps<'div'> & { label?: string }) {
  return (
    <div
      className={cn('overflow-x-auto rounded-lg border border-border bg-surface shadow-e1', className)}
      {...(label ? { role: 'region', 'aria-label': label, tabIndex: 0 } : {})}
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
