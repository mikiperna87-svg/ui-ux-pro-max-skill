'use client'

import { useEffect } from 'react'

/**
 * Avviso prima di abbandonare modifiche non salvate.
 *
 * Copre due strade diverse: la chiusura o il ricaricamento della pagina (dove
 * il browser mostra il proprio avviso) e i collegamenti interni, intercettati
 * in fase di cattura perché il router di Next non offre un modo per rifiutare
 * una navigazione già avviata.
 */
export function UnsavedChangesGuard({
  when,
  message = 'Ci sono modifiche non salvate. Vuoi davvero uscire da questa pagina?',
}: {
  when: boolean
  message?: string
}) {
  useEffect(() => {
    if (!when) return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // I browser moderni mostrano un testo proprio: conta solo impedire l'uscita.
      event.returnValue = message
    }

    function onClickCapture(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') ?? ''
      // I collegamenti a un'altra scheda, i download e le ancore interne passano.
      if (anchor.target === '_blank' || anchor.hasAttribute('download') || href.startsWith('#')) return

      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClickCapture, true)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClickCapture, true)
    }
  }, [when, message])

  return null
}
