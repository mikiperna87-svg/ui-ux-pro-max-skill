'use client'

import { FileMinus, Send, Stamp, Trash2 } from 'lucide-react'
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
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { toDateInput } from '@/lib/date'
import {
  creditNoteAction,
  deleteDraftInvoiceAction,
  issueInvoiceAction,
  sendInvoiceAction,
} from '@/server/actions/fatture'

const oggi = () => new Date().toISOString().slice(0, 10)

export function AzioniFattura({
  invoiceId,
  kind,
  status,
  code,
  issueDate,
  hasItems,
  canWrite,
}: {
  invoiceId: string
  kind: Enums['invoice_kind']
  status: Enums['invoice_status']
  code: string | null
  issueDate: string | null
  hasItems: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [emissione, setEmissione] = useState(false)
  const [storno, setStorno] = useState(false)

  function invia() {
    startTransition(async () => {
      const esito = await sendInvoiceAction(invoiceId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Documento inviato.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a segnare l’invio.')
      }
    })
  }

  function elimina() {
    startTransition(async () => {
      const esito = await deleteDraftInvoiceAction(invoiceId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Bozza eliminata.')
        router.push('/fatture')
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare la bozza.')
      }
    })
  }

  if (!canWrite) return null

  const bozza = status === 'bozza'

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {bozza ? (
          <>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  <Trash2 aria-hidden="true" />
                  Elimina la bozza
                </Button>
              }
              title="Eliminare la bozza?"
              description="Non essendo ancora numerata, non lascia buchi nella numerazione. L’operazione resta nel registro attività."
              confirmLabel="Elimina"
              onConfirm={elimina}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!hasItems}
              onClick={() => setEmissione(true)}
            >
              <Stamp aria-hidden="true" />
              Emetti
            </Button>
          </>
        ) : null}

        {status === 'emessa' ? (
          <Button variant="secondary" size="sm" onClick={invia}>
            <Send aria-hidden="true" />
            Segna come inviata
          </Button>
        ) : null}

        {!bozza && kind === 'fattura' ? (
          <Button variant="secondary" size="sm" onClick={() => setStorno(true)}>
            <FileMinus aria-hidden="true" />
            Nota di credito
          </Button>
        ) : null}
      </div>

      {bozza && !hasItems ? (
        <p className="text-caption text-text-muted">
          Per emettere serve almeno una riga.
        </p>
      ) : null}

      <DialogoEmissione
        invoiceId={invoiceId}
        issueDate={issueDate}
        open={emissione}
        onOpenChange={setEmissione}
      />
      <DialogoNotaCredito
        invoiceId={invoiceId}
        code={code}
        open={storno}
        onOpenChange={setStorno}
      />
    </>
  )
}

/**
 * L'emissione è il momento in cui il documento prende il numero. Si chiede la
 * data perché è quella che decide l'anno della numerazione e il mese del
 * registro IVA, e perché una bozza di dicembre può essere emessa a gennaio.
 */
function DialogoEmissione({
  invoiceId,
  issueDate,
  open,
  onOpenChange,
}: {
  invoiceId: string
  issueDate: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(issueInvoiceAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Documento emesso.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Emettere il documento?</DialogTitle>
            <DialogDescription>
              Riceve il numero progressivo dell’anno e da quel momento non si modifica più: un
              errore si corregge con una nota di credito.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="id" value={invoiceId} />

            <Field label="Data di emissione" required error={state.fieldErrors?.issue_date}>
              {(props) => (
                <Input
                  {...props}
                  name="issue_date"
                  type="date"
                  max={oggi()}
                  defaultValue={state.values?.issue_date ?? (toDateInput(issueDate) || oggi())}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Emissione...">Emetti</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DialogoNotaCredito({
  invoiceId,
  code,
  open,
  onOpenChange,
}: {
  invoiceId: string
  code: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(creditNoteAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Nota di credito creata.')
      const nuovaId = state.values?.id
      if (nuovaId) router.push(`/fatture/${nuovaId}`)
      else router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Nota di credito sulla fattura {code}</DialogTitle>
            <DialogDescription>
              Viene creata una bozza con le stesse righe: puoi toglierne o correggerne gli importi
              prima di emetterla. La fattura originale resta com’è.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="invoice_id" value={invoiceId} />

            <Field label="Motivo dello storno" required error={state.fieldErrors?.reason}>
              {(props) => (
                <Textarea
                  {...props}
                  name="reason"
                  rows={3}
                  placeholder="Annullamento del viaggio, errore di fatturazione, sconto riconosciuto…"
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
            <SubmitButton variant="secondary" pendingLabel="Creazione...">
              Crea la bozza
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
