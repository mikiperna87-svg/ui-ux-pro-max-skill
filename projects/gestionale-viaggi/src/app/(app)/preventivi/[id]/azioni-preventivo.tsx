'use client'

import { Check, Link2, Mail, Send, Luggage } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { QUOTE_VARIANT, varianteConArticolo } from '@/lib/labels'
import { inviaPreventivoEmailAction } from '@/server/actions/email'
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
  customerEmail,
  customerName,
}: {
  quoteId: string
  status: Enums['quote_status']
  acceptedVariant: Variante | null
  convertedBookingId: string | null
  variantiDisponibili: readonly Variante[]
  canWrite: boolean
  customerEmail: string | null
  customerName: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [collegamento, setCollegamento] = useState<string | null>(null)
  const [invio, setInvio] = useState(false)

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
        {status === 'bozza' || status === 'inviato' ? (
          <Button variant="primary" size="sm" onClick={() => setInvio(true)}>
            <Mail aria-hidden="true" />
            {status === 'bozza' ? 'Invia al cliente' : 'Rimanda al cliente'}
          </Button>
        ) : null}

        {status === 'bozza' ? (
          <Button variant="secondary" size="sm" onClick={segnaInviato}>
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

      {invio ? (
        <DialogoInvio
          quoteId={quoteId}
          open={invio}
          onOpenChange={setInvio}
          customerEmail={customerEmail}
          customerName={customerName}
        />
      ) : null}
    </div>
  )
}

/**
 * L'invio del preventivo al cliente.
 *
 * Il messaggio porta il collegamento pubblico, non un allegato: da lì il
 * cliente confronta le proposte e accetta quella che preferisce, che è il
 * motivo per cui il collegamento esiste. Il testo scritto qui compare in
 * apertura, prima delle righe del modello.
 */
function DialogoInvio({
  quoteId,
  open,
  onOpenChange,
  customerEmail,
  customerName,
}: {
  quoteId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  customerEmail: string | null
  customerName: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(inviaPreventivoEmailAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Preventivo inviato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Inviare il preventivo{customerName ? ` a ${customerName}` : ''}?</DialogTitle>
            <DialogDescription>
              Il cliente riceve un messaggio con il collegamento alle proposte: le confronta e
              accetta quella che preferisce, senza registrarsi. Da questo momento il preventivo
              risulta inviato.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="quote_id" value={quoteId} />

            <Field label="Indirizzo del cliente" required error={state.fieldErrors?.to}>
              {(props) => (
                <Input
                  {...props}
                  name="to"
                  type="email"
                  defaultValue={state.values?.to ?? customerEmail ?? ''}
                  placeholder="cliente@example.it"
                />
              )}
            </Field>

            <Field
              label="Due righe per il cliente"
              hint="Facoltative: compaiono in apertura, prima del riepilogo del viaggio."
              error={state.fieldErrors?.message}
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="message"
                  rows={3}
                  maxLength={1500}
                  placeholder="Come d’accordo al telefono, le mando la proposta per il suo viaggio."
                  defaultValue={state.values?.message ?? ''}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Invio...">Invia</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
