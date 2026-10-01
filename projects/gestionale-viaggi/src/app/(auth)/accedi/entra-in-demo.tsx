'use client'

import { Eye } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { signInAction } from '@/server/actions/auth'

/**
 * L'ingresso nella demo, con un clic.
 *
 * Chiedere a chi valuta un gestionale di copiare a mano un'email e una
 * password è il modo più semplice per perderlo: ogni passaggio in più è gente
 * che non arriva in fondo. Qui le credenziali ci sono lo stesso, scritte sotto
 * al pulsante — servono a chi vuole rientrare domani, o provare un altro
 * ruolo.
 *
 * L'azione è la stessa dell'accesso normale: nessuna scorciatoia che salti i
 * controlli, nessuna sessione costruita a parte. La demo entra dalla porta
 * principale, con un account che il database conosce come «sola lettura».
 */
export function EntraInDemo({ email, password }: { email: string; password: string }) {
  const router = useRouter()
  const toast = useToast()
  const [inCorso, startTransition] = useTransition()
  const [mostraCredenziali, setMostraCredenziali] = useState(false)

  function entra() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('email', email)
      formData.set('password', password)
      const esito = await signInAction({ status: 'idle' }, formData)
      // L'azione reindirizza da sé quando va a buon fine: se torna qualcosa,
      // è un errore.
      if (esito.status === 'error') {
        toast.error(esito.message ?? 'La demo non è raggiungibile in questo momento.')
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
      <div className="space-y-1">
        <p className="text-small font-semibold text-text">Vuoi solo vedere com’è fatto?</p>
        <p className="text-small text-text-muted">
          Entra nell’agenzia dimostrativa: sessanta pratiche vere, preventivi, incassi, fatture e
          registro IVA. È in sola lettura, quindi puoi aprire tutto senza rompere niente.
        </p>
      </div>

      <Button type="button" variant="secondary" block onClick={entra} disabled={inCorso}>
        <Eye aria-hidden="true" />
        {inCorso ? 'Apertura in corso...' : 'Entra nella demo'}
      </Button>

      <p className="text-caption text-text-subtle">
        {mostraCredenziali ? (
          <>
            Accesso: <span className="font-mono text-text-muted">{email}</span> · password{' '}
            <span className="font-mono text-text-muted">{password}</span>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMostraCredenziali(true)}
            className="underline underline-offset-4 hover:no-underline"
          >
            Mostra le credenziali della demo
          </button>
        )}
      </p>
    </div>
  )
}
