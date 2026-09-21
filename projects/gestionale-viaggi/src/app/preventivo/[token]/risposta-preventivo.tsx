'use client'

import { Check, CircleX } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { varianteConArticolo } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import {
  acceptQuotePublicAction,
  rejectQuotePublicAction,
} from '@/server/actions/preventivi'

type Variante = Enums['quote_variant']

/**
 * I due comandi della pagina pubblica.
 *
 * Chi arriva qui non ha un account e probabilmente sta leggendo dal telefono:
 * l'accettazione chiede una cosa sola, il nome, e il rifiuto non chiede niente
 * di obbligatorio — un motivo lo si scrive se si vuole.
 */
export function RispostaPreventivo({
  token,
  scelte,
}: {
  token: string
  scelte: ReadonlyArray<{ variant: Variante; totale: number }>
}) {
  const [accettazione, setAccettazione] = useState<Variante | null>(null)
  const [rifiuto, setRifiuto] = useState(false)

  return (
    <>
      <div className="space-y-3">
        <p className="text-small font-medium text-text">Quale proposta preferisce?</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {scelte.map((scelta) => (
            <Button
              key={scelta.variant}
              variant="primary"
              onClick={() => setAccettazione(scelta.variant)}
            >
              <Check aria-hidden="true" />
              Accetto {varianteConArticolo(scelta.variant)} · {formatEuro(scelta.totale)}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setRifiuto(true)}>
          <CircleX aria-hidden="true" />
          Non sono interessato
        </Button>
      </div>

      <DialogoAccettazione
        token={token}
        variante={accettazione}
        totale={scelte.find((scelta) => scelta.variant === accettazione)?.totale ?? 0}
        onOpenChange={(valore) => {
          if (!valore) setAccettazione(null)
        }}
      />
      <DialogoRifiuto token={token} open={rifiuto} onOpenChange={setRifiuto} />
    </>
  )
}

function DialogoAccettazione({
  token,
  variante,
  totale,
  onOpenChange,
}: {
  token: string
  variante: Variante | null
  totale: number
  onOpenChange: (open: boolean) => void
}) {
  const [state, submit] = useActionState(acceptQuotePublicAction, IDLE)

  // Dopo l'accettazione la pagina si ricarica da sola e mostra l'esito: il
  // dialogo resta aperto solo il tempo di leggere il messaggio.
  useEffect(() => {
    if (state.status === 'success') {
      const timer = setTimeout(() => window.location.reload(), 1200)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [state])

  return (
    <Dialog open={variante !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>
              Confermare {variante ? varianteConArticolo(variante) : 'la proposta'}?
            </DialogTitle>
            <DialogDescription>
              Importo {formatEuro(totale)}. L’agenzia riceve la sua scelta e la contatterà per i
              passi successivi. Non è un pagamento.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="variant" value={variante ?? ''} />

            <Field
              label="Il suo nome e cognome"
              required
              hint="Serve all’agenzia per sapere chi ha confermato."
              error={state.fieldErrors?.name}
            >
              {(props) => (
                <Input
                  {...props}
                  name="name"
                  autoComplete="name"
                  defaultValue={state.values?.name ?? ''}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Invio...">Confermo</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoRifiuto({
  token,
  open,
  onOpenChange,
}: {
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [state, submit] = useActionState(rejectQuotePublicAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      const timer = setTimeout(() => window.location.reload(), 1200)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Grazie per averci avvisato</DialogTitle>
            <DialogDescription>
              Se vuole dirci perché, ci aiuta a fare una proposta migliore la prossima volta. Non è
              obbligatorio.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="token" value={token} />

            <Field label="Motivo" error={state.fieldErrors?.reason}>
              {(props) => (
                <Textarea
                  {...props}
                  name="reason"
                  rows={3}
                  placeholder="Fuori budget, date non compatibili, abbiamo scelto un'altra soluzione…"
                  defaultValue={state.values?.reason ?? ''}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton variant="secondary" pendingLabel="Invio...">
              Invia
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
