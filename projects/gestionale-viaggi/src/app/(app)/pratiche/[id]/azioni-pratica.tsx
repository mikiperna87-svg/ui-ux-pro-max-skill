'use client'

import { CircleCheck, EllipsisVertical, Ban, Plane, PlaneLanding } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import {
  cancelBookingAction,
  confirmBookingAction,
  updateBookingStatusAction,
} from '@/server/actions/pratiche'

/**
 * Comandi di stato della pratica.
 *
 * La conferma non è un cambio di etichetta: genera l'acconto, il saldo e il
 * controllo dei documenti. L'annullamento pretende un motivo e registra la
 * penale, e non cancella niente. Per questo stanno qui e non in una tendina
 * qualunque di stato.
 */
export function AzioniPratica({
  bookingId,
  code,
  status,
  depositDays,
  balanceDays,
  depositPercent,
}: {
  bookingId: string
  code: string
  status: Enums['booking_status']
  depositDays: number
  balanceDays: number
  depositPercent: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [state, submit] = useActionState(cancelBookingAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      setCancelOpen(false)
      toast.success(state.message ?? 'Pratica annullata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function esegui(azione: () => Promise<{ status: string; message?: string }>) {
    startTransition(async () => {
      const esito = await azione()
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Fatto.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Operazione non riuscita.')
      }
    })
  }

  const annullata = status === 'annullata'

  return (
    <>
      {status === 'opzione' ? (
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => esegui(() => confirmBookingAction(bookingId))}
        >
          <CircleCheck aria-hidden="true" />
          Conferma
        </Button>
      ) : null}

      {status === 'confermata' ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => esegui(() => updateBookingStatusAction(bookingId, 'partita'))}
        >
          <Plane aria-hidden="true" />
          Segna partita
        </Button>
      ) : null}

      {status === 'partita' ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => esegui(() => updateBookingStatusAction(bookingId, 'rientrata'))}
        >
          <PlaneLanding aria-hidden="true" />
          Segna rientrata
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon-sm" aria-label="Altre azioni">
            <EllipsisVertical className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-72">
          <DropdownMenuLabel>Stato della pratica</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {status !== 'opzione' && !annullata ? (
            <DropdownMenuItem
              onSelect={() => esegui(() => updateBookingStatusAction(bookingId, 'opzione'))}
            >
              Riporta in opzione
            </DropdownMenuItem>
          ) : null}

          {status !== 'confermata' && !annullata ? (
            <DropdownMenuItem onSelect={() => esegui(() => confirmBookingAction(bookingId))}>
              Conferma (rigenera le scadenze)
            </DropdownMenuItem>
          ) : null}

          {annullata ? (
            <DropdownMenuItem
              onSelect={() => esegui(() => updateBookingStatusAction(bookingId, 'opzione'))}
            >
              Riapri in opzione
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCancelOpen(true)}>
                <Ban className="size-3.5 text-danger" aria-hidden="true" />
                Annulla la pratica
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent size="sm">
          <form action={submit}>
            <DialogHeader>
              <DialogTitle>Annullare la pratica {code}?</DialogTitle>
              <DialogDescription>
                Nulla viene cancellato: la pratica resta consultabile, le scadenze future vengono
                tolte e i task aperti chiusi. Il motivo finisce nel registro attività.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <input type="hidden" name="booking_id" value={bookingId} />

              <Field label="Motivo dell’annullamento" required error={state.fieldErrors?.reason}>
                {(props) => (
                  <Textarea
                    {...props}
                    name="reason"
                    rows={3}
                    placeholder="Rinuncia del cliente per motivi di salute"
                    defaultValue={state.values?.reason ?? ''}
                  />
                )}
              </Field>

              <Field
                label="Penale trattenuta"
                hint="Quanto resta all’agenzia secondo le condizioni di vendita."
                error={state.fieldErrors?.penalty}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="penalty"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={state.values?.penalty ?? ''}
                  />
                )}
              </Field>

              <FormMessage status={state.status} message={state.message} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
                Torna indietro
              </Button>
              <SubmitButton variant="danger" pendingLabel="Annullamento...">
                Annulla la pratica
              </SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {status === 'opzione' ? (
        <p className="sr-only">
          Confermando la pratica nascono l’acconto del {depositPercent} a {depositDays} giorni e il
          saldo {balanceDays} giorni prima della partenza.
        </p>
      ) : null}
    </>
  )
}
