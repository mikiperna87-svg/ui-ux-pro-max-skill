import { Compass } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * "Non trovato" dentro l'applicazione.
 *
 * Senza questo file la pagina 404 della radice prendeva tutto lo schermo,
 * barra laterale compresa: chi apriva il collegamento a una pratica cancellata
 * — o di un'altra agenzia, che per la RLS è la stessa cosa — si ritrovava
 * fuori dal gestionale, con un solo bottone per rientrare. Qui la navigazione
 * resta dov'è, e si riparte da dove si era.
 *
 * Il titolo è un `h1` vero e ripete quello della 404 di radice: la pagina
 * cambia cornice, non messaggio, e chi la raggiunge con un lettore di schermo
 * sente la stessa cosa nei due casi.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface-2 px-6 py-16 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-surface text-text-subtle shadow-e1 [&_svg]:size-5">
        <Compass aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="text-heading text-text">Pagina non trovata</h1>
        <p className="mx-auto max-w-sm text-small text-text-muted">
          Il collegamento potrebbe essere vecchio, oppure riguarda qualcosa che è stato eliminato
          o che il tuo ruolo non può vedere. Usa il menu qui accanto, oppure ⌘K per cercare.
        </p>
      </div>
      <Button asChild variant="primary">
        <Link href="/">Torna alla panoramica</Link>
      </Button>
    </div>
  )
}
