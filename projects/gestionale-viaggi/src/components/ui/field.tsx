'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps {
  readonly label: string
  readonly children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
  readonly className?: string
}

/**
 * Campo di form con etichetta sempre visibile, suggerimento e errore inline.
 * Non esistono campi con la sola placeholder: dopo la digitazione l’utente
 * perderebbe il riferimento a che cosa sta scrivendo.
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <LabelPrimitive.Root
        htmlFor={id}
        className="text-small font-medium text-text flex items-center gap-1"
      >
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(obbligatorio)</span> : null}
      </LabelPrimitive.Root>

      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}

      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
