'use client'

import { Search, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { buildListHref } from '@/lib/list-params'
import { cn } from '@/lib/utils'

/**
 * Ricerca della griglia. Scrive nell'indirizzo con un ritardo, così un elenco
 * filtrato resta condivisibile senza interrogare il database a ogni tasto.
 */
export function SearchField({
  placeholder = 'Cerca...',
  className,
  delay = 350,
}: {
  placeholder?: string
  className?: string
  delay?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const urlValue = searchParams.get('q') ?? ''
  const [value, setValue] = useState(urlValue)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Il tasto "indietro" cambia l'indirizzo: il campo deve seguirlo.
  useEffect(() => {
    setValue(urlValue)
  }, [urlValue])

  function push(next: string) {
    const current = Object.fromEntries(searchParams.entries())
    const href = buildListHref(pathname, current, { q: next.trim() === '' ? null : next })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  function onChange(next: string) {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => push(next), delay)
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current)
    setValue('')
    push('')
  }

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (timer.current) clearTimeout(timer.current)
            push(value)
          }
          if (event.key === 'Escape' && value !== '') {
            event.preventDefault()
            clear()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-busy={pending}
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== '' ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-subtle transition-colors hover:text-text"
        >
          <X className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Azzera la ricerca</span>
        </button>
      ) : null}
    </div>
  )
}
