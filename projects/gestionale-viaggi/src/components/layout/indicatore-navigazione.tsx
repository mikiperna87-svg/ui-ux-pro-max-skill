'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/** Dopo quanto l'indicatore si spegne se la navigazione non arriva. */
const RESA = 15_000

/**
 * La barra che dice «ho ricevuto il clic».
 *
 * Il router di Next tiene a schermo la pagina corrente finché la prossima non è
 * pronta: fra il clic e il primo cambiamento passavano oltre mille
 * millisecondi, misurati, e in quel tempo il gestionale sembrava non aver
 * sentito niente. La voce di menu era l'unico comando che rispondeva subito, e
 * solo perché aveva una rotellina.
 *
 * Perché globale e non su ogni collegamento: i comandi che portano a un'altra
 * pagina sono cinquantaquattro, e metterci la mano uno per uno vuol dire
 * dimenticarne qualcuno oggi e tutti quelli aggiunti domani. Qui si osservano i
 * clic sui collegamenti interni e il cambio di indirizzo, che è il momento in
 * cui la navigazione è finita.
 *
 * Perché non `loading.tsx`, che sarebbe la soluzione di Next: quel file crea un
 * confine Suspense sopra le pagine e su Next 15 lascia le mutazioni bloccate su
 * «Salvataggio...» — misurato, 16 su 40 (DECISIONI 35). Questo indicatore non
 * tocca la gerarchia dei confini: guarda e disegna.
 */
export function IndicatoreNavigazione() {
  const [attiva, setAttiva] = useState(false)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scadenza = useRef<ReturnType<typeof setTimeout> | null>(null)

  // L'indirizzo è cambiato: la pagina nuova è arrivata, o la navigazione è
  // stata abbandonata. In entrambi i casi non c'è più niente da attendere.
  useEffect(() => {
    setAttiva(false)
    if (scadenza.current) clearTimeout(scadenza.current)
  }, [pathname, searchParams])

  useEffect(() => {
    function alClic(evento: MouseEvent) {
      // Un clic con un modificatore apre altrove: questa pagina non si muove.
      if (evento.defaultPrevented) return
      if (evento.button !== 0) return
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return

      const bersaglio = evento.target as HTMLElement | null
      const collegamento = bersaglio?.closest('a')
      if (!collegamento) return
      if (collegamento.target === '_blank' || collegamento.hasAttribute('download')) return

      const href = collegamento.getAttribute('href')
      // Solo navigazioni interne: niente indirizzi esterni, ancore, `mailto:`.
      if (!href || !href.startsWith('/')) return

      // Un collegamento alla pagina in cui si è già non fa partire niente, e
      // una barra che compare senza motivo è peggio di nessuna barra.
      const destinazione = new URL(collegamento.href, window.location.href)
      if (
        destinazione.pathname === window.location.pathname &&
        destinazione.search === window.location.search
      ) {
        return
      }

      setAttiva(true)
      if (scadenza.current) clearTimeout(scadenza.current)
      scadenza.current = setTimeout(() => setAttiva(false), RESA)
    }

    document.addEventListener('click', alClic, { capture: true })
    return () => document.removeEventListener('click', alClic, { capture: true })
  }, [])

  if (!attiva) return null

  return (
    <>
      <div
        // Sopra ogni cosa e fuori dal flusso: la barra non deve spostare di un
        // pixel il contenuto che sta per essere sostituito.
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-accent-subtle"
        aria-hidden="true"
      >
        {/*
          Il movimento dice «sto lavorando» meglio di qualunque colore. Chi ha
          chiesto meno movimento riceve invece una barra ferma, che resta un
          segnale senza essere un'animazione.
        */}
        <div className="h-full w-1/3 animate-scorri bg-accent motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <span role="status" className="sr-only">
        Caricamento della pagina
      </span>
    </>
  )
}
