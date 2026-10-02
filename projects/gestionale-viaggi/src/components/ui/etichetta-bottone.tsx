import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * L'etichetta di un comando che sullo schermo stretto lascia solo l'icona.
 *
 * `hidden` toglie l'elemento anche dall'albero di accessibilità: il bottone
 * resta con la sola icona, che è decorativa, e un lettore di schermo annuncia
 * "pulsante" e nient'altro. Chi naviga da telefono con VoiceOver o TalkBack si
 * trova una fila di comandi senza nome.
 *
 * `sr-only` invece nasconde alla vista e lascia il testo a chi ascolta: sopra
 * la soglia `sm` l'etichetta ricompare com'era. Visivamente il risultato è
 * identico, perché `sr-only` toglie l'elemento dal flusso e quindi non occupa
 * nemmeno lo spazio del `gap`.
 */
export function EtichettaBottone({
  children,
  className,
  da = 'sm',
}: {
  children: ReactNode
  className?: string
  /** La soglia oltre la quale l'etichetta torna visibile. */
  da?: 'sm' | 'md'
}) {
  return (
    <span
      className={cn(
        'sr-only',
        da === 'sm' ? 'sm:not-sr-only sm:inline' : 'md:not-sr-only md:inline',
        className,
      )}
    >
      {children}
    </span>
  )
}
