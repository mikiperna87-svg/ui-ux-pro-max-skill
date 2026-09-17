'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
}

interface SegmentedControlProps<T extends string> {
  /** Etichetta del gruppo: letta dagli screen reader prima delle opzioni. */
  readonly label: string
  readonly value: T
  readonly options: readonly SegmentedOption<T>[]
  readonly onChange: (value: T) => void
  readonly className?: string
}

/**
 * Selettore a segmenti per scelte brevi e mutuamente esclusive.
 *
 * Il modello diffuso — un <input type="radio"> reso invisibile dentro la
 * <label> — lascia il contorno di fuoco su un elemento di un pixel: chi naviga
 * da tastiera non vede dove si trova, e il puntatore finisce sulla label
 * invece che sul comando. Qui ogni segmento è un bottone con role="radio", per
 * cui riceve per intero il contorno globale di :focus-visible; il fuoco entra
 * una volta sola nel gruppo (tabindex mobile) e le frecce spostano la scelta
 * come in un gruppo di radio nativo.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const group = useRef<HTMLDivElement>(null)

  function move(direction: 1 | -1 | 'first' | 'last') {
    const current = options.findIndex((option) => option.value === value)
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? options.length - 1
          : (current + direction + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
      onKeyDown={(event) => {
        const tasti: Record<string, 1 | -1 | 'first' | 'last'> = {
          ArrowRight: 1,
          ArrowDown: 1,
          ArrowLeft: -1,
          ArrowUp: -1,
          Home: 'first',
          End: 'last',
        }
        const direction = tasti[event.key]
        if (direction === undefined) return
        event.preventDefault()
        move(direction)
      }}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-small transition-colors',
              selected
                ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
