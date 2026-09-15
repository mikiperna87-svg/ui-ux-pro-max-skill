'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildListHref } from '@/lib/list-params'

const TUTTI = '__tutti__'

/** Filtro a tendina che scrive nell'indirizzo, come la ricerca. */
export function FilterSelect({
  name,
  label,
  options,
  allLabel = 'Tutti',
  className,
}: {
  name: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  allLabel?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = searchParams.get(name) ?? TUTTI

  // Radix ricava il testo del valore dagli elementi dell'elenco, che esistono
  // solo dopo l'idratazione: senza questa etichetta il filtro resterebbe una
  // casella vuota per tutto il primo disegno della pagina.
  const currentLabel =
    current === TUTTI ? allLabel : (options.find((option) => option.value === current)?.label ?? allLabel)

  function change(next: string) {
    const params = Object.fromEntries(searchParams.entries())
    const href = buildListHref(pathname, params, { [name]: next === TUTTI ? null : next })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger className={className} aria-label={label} aria-busy={pending}>
        <SelectValue placeholder={label}>{currentLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TUTTI}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
