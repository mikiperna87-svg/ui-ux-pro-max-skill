'use client'

import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Rotellina che compare accanto alla voce di menu mentre la pagina di
 * destinazione viene preparata dal server.
 *
 * Va usata come discendente di un `<Link>`: `useLinkStatus` legge lo stato
 * della navigazione avviata da quel link.
 *
 * Sostituisce il `loading.tsx` di rotta, rimosso perché il confine Suspense
 * che creava sopra le pagine attiva un difetto del router di Next 15 che
 * lascia le mutazioni bloccate su "Salvataggio..." (vedi DECISIONI.md).
 */
export function StatoNavigazione({ className }: { className?: string }) {
  const { pending } = useLinkStatus()

  if (!pending) return null

  return (
    <span className={cn('ml-auto flex items-center', className)}>
      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" aria-hidden="true" />
      <span className="sr-only">Caricamento in corso</span>
    </span>
  )
}
