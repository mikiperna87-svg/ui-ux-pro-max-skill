'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type MouseEvent } from 'react'

/** Dopo quanto la riga smette di dirsi occupata se la navigazione non arriva. */
const RESA = 10_000

/**
 * Segnala quale riga di un elenco sta aprendo la sua scheda.
 *
 * Il problema che risolve, misurato: dal clic su una riga passava oltre un
 * secondo prima che qualcosa cambiasse a schermo, perché il router di Next
 * tiene la pagina vecchia finché la nuova non è pronta. Lo stesso clic su una
 * voce di menu sembrava immediato pur essendo più lento ad arrivare, e la
 * differenza era solo la rotellina che compariva in quattordici millisecondi.
 *
 * Qui lo stato si prende all'inizio del clic — `onClickCapture`, prima che il
 * router parta — e si libera quando l'indirizzo cambia, cioè quando la
 * navigazione è finita. Non serve un `loading.tsx`: quello creerebbe un confine
 * Suspense sopra le pagine, che su Next 15 lascia le mutazioni bloccate su
 * «Salvataggio...» (DECISIONI 35).
 *
 * Il ripiego a tempo esiste perché una navigazione si può annullare — un clic
 * su un altro link, il tasto indietro — e una riga che gira per sempre dice una
 * cosa falsa.
 */
export function useRigaInAttesa(): {
  inAttesa: string | null
  segnalaClic: (id: string) => (evento: MouseEvent<HTMLElement>) => void
} {
  const [inAttesa, setInAttesa] = useState<string | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scadenza = useRef<ReturnType<typeof setTimeout> | null>(null)

  // L'indirizzo è cambiato: la navigazione è finita, in un modo o nell'altro.
  useEffect(() => {
    setInAttesa(null)
  }, [pathname, searchParams])

  useEffect(() => () => {
    if (scadenza.current) clearTimeout(scadenza.current)
  }, [])

  const segnalaClic = (id: string) => (evento: MouseEvent<HTMLElement>) => {
    const bersaglio = evento.target as HTMLElement | null
    const collegamento = bersaglio?.closest('a')

    // Solo i collegamenti interni che portano via da qui: una casella di
    // selezione, un menu a tendina o un indirizzo esterno non sono una
    // navigazione, e segnalarli sarebbe una bugia.
    if (!collegamento) return
    const href = collegamento.getAttribute('href')
    if (!href || !href.startsWith('/')) return
    if (collegamento.target === '_blank' || collegamento.hasAttribute('download')) return
    // Il modificatore apre in una scheda nuova: questa pagina non si muove.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || evento.button !== 0) return

    setInAttesa(id)
    if (scadenza.current) clearTimeout(scadenza.current)
    scadenza.current = setTimeout(() => setInAttesa(null), RESA)
  }

  return { inAttesa, segnalaClic }
}
