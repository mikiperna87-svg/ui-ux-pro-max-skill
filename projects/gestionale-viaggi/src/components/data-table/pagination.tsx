'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildListHref, PAGE_SIZES } from '@/lib/list-params'

/**
 * Paginazione lato server: il numero di pagina è nell'indirizzo, così la
 * pagina 7 di un elenco filtrato resta raggiungibile e condivisibile.
 */
export function Pagination({
  page,
  perPage,
  total,
  pageCount,
}: {
  page: number
  perPage: number
  total: number
  pageCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function go(nextPage: number) {
    const params = Object.fromEntries(searchParams.entries())
    const href = buildListHref(pathname, params, { pagina: nextPage <= 1 ? null : nextPage })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  function changeSize(next: string) {
    const params = Object.fromEntries(searchParams.entries())
    const href = buildListHref(pathname, params, { per: next, pagina: null })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  const first = total === 0 ? 0 : (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)

  return (
    <div
      className="flex flex-col gap-3 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      aria-busy={pending}
    >
      <p className="text-caption text-text-muted">
        {total === 0 ? (
          'Nessuna riga'
        ) : (
          <>
            <span className="num">{first}</span>–<span className="num">{last}</span> di{' '}
            <span className="num font-medium text-text">{total}</span>
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-caption text-text-muted">
          <span className="hidden sm:inline">Righe</span>
          <Select value={String(perPage)} onValueChange={changeSize}>
            <SelectTrigger className="h-8 w-20" aria-label="Righe per pagina">
              {/* Come nei filtri: il testo va reso anche prima dell'idratazione. */}
              <SelectValue>{perPage}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(1)}
            disabled={page <= 1}
            aria-label="Prima pagina"
          >
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="Pagina precedente"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="num px-1 text-caption text-text-muted">
            {page} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(page + 1)}
            disabled={page >= pageCount}
            aria-label="Pagina successiva"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => go(pageCount)}
            disabled={page >= pageCount}
            aria-label="Ultima pagina"
          >
            <ChevronsRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
