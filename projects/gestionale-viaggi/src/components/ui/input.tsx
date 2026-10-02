import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full rounded-md border border-border bg-surface px-3 text-body text-text',
        'placeholder:text-text-subtle',
        'transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-soft)]',
        'hover:border-border-strong',
        'focus:border-accent',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-subtle',
        'aria-[invalid=true]:border-danger',
        'file:mr-3 file:border-0 file:bg-transparent file:text-small file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      data-slot="textarea"
      className={cn(
        'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text',
        'placeholder:text-text-subtle resize-y min-h-20',
        'transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-soft)]',
        'hover:border-border-strong',
        'focus:border-accent',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-subtle',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}
