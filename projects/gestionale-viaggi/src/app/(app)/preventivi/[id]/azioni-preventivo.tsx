'use client'

import { Check, Link2, Send, Luggage } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import type { Enums } from '@/lib/database.types'
import { QUOTE_VARIANT, varianteConArticolo } from '@/lib/labels'
import {
  convertQuoteAction,
  markQuoteSentAction,
  quotePublicUrlAction,
} from '@/server/actions/preventivi'

type Variante = Enums['quote_variant']

const VARIANTI: readonly Variante[] = ['base', 'consigliata', 'premium']

export function AzioniPreventivo({
  quoteId,
  status,
  acceptedVariant,
  convertedBookingId,
  variantiDisponibili,
  canWrite,
}: {
  quoteId: string
  status: Enums['quote_status']
  acceptedVariant: Variante | null
  convertedBookingId: string | null
  variantiDisponibili: readonly Variante[]
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [collegamento, setCollegamento] = useState<string | null>(null)

  function segnaInviato() {
    startTransition(async () => {
      const esito = await markQuoteSentAction(quoteId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Preventivo inviato.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a segnare l’invio.')
      }
    })
  }

  function copiaCollegamento() {
    startTransition(async () => {
      const esito = await quotePublicUrlAction(quoteId)
      if (esito.status !== 'success' || !esito.message) {
        toast.error('Non siamo riusciti a costruire il collegamento.')
        return
      }
      setCollegamento(esito.message)
      try {
        await navigator.clipboard.writeText(esito.message)
        toast.success('Collegamento copiato.')
      } catch {
        // Senza permesso sugli appunti il collegamento resta a schermo, da
        // selezionare a mano: meglio che un errore senza via d'uscita.
        toast.show({
          tone: 'info',
          title: 'Collegamento pronto qui sotto',
          description: 'Il browser non ha concesso gli appunti: selezionalo e copialo a mano.',
        })
      }
    })
  }

  function converti(variante: Variante) {
    startTransition(async () => {
      const esito = await convertQuoteAction(quoteId, variante)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Pratica creata.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a convertire il preventivo.')
      }
    })
  }

  if (!canWrite) return null

  const convertito = convertedBookingId !== null

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'bozza' ? (
          <Button variant="primary" size="sm" onClick={segnaInviato}>
            <Send aria-hidden="true" />
            Segna come inviato
          </Button>
        ) : null}

        {status !== 'bozza' ? (
          <Button variant="secondary" size="sm" onClick={copiaCollegamento}>
            <Link2 aria-hidden="true" />
            Copia il collegamento
          </Button>
        ) : null}

        {!convertito && variantiDisponibili.length > 0 ? (
          acceptedVariant ? (
            <ConfirmDialog
              trigger={
                <Button variant="primary" size="sm">
                  <Luggage aria-hidden="true" />
                  Converti in pratica
                </Button>
              }
              title="Aprire la pratica da questo preventivo?"
              description={`Le voci della proposta "${QUOTE_VARIANT[acceptedVariant].label}" diventano le righe di servizio della nuova pratica. Il preventivo resta collegato.`}
              confirmLabel="Apri la pratica"
              onConfirm={() => converti(acceptedVariant)}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Luggage aria-hidden="true" />
                  Converti in pratica
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {VARIANTI.filter((variante) => variantiDisponibili.includes(variante)).map(
                  (variante) => (
                    <DropdownMenuItem key={variante} onSelect={() => converti(variante)}>
                      <Check aria-hidden="true" />
                      Converti {varianteConArticolo(variante)}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : null}
      </div>

      {collegamento ? (
        <p className="max-w-md break-all rounded-md bg-surface-2 px-2.5 py-1.5 text-caption text-text-muted">
          {collegamento}
        </p>
      ) : null}
    </div>
  )
}
