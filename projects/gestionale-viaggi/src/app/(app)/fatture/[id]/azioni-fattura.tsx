'use client'

import { FileMinus, Mail, Send, Stamp, Trash2 } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { toDateInput } from '@/lib/date'
import { inviaFatturaEmailAction } from '@/server/actions/email'
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
  customerEmail,
  customerName,
}: {
  invoiceId: string
  kind: Enums['invoice_kind']
  status: Enums['invoice_status']
  code: string | null
  issueDate: string | null
  hasItems: boolean
  canWrite: boolean
  customerEmail: string | null
  customerName: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [emissione, setEmissione] = useState(false)
  const [storno, setStorno] = useState(false)
  const [invio, setInvio] = useState(false)

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

        {!bozza && status !== 'annullata' ? (
          <Button variant="primary" size="sm" onClick={() => setInvio(true)}>
            <Mail aria-hidden="true" />
            Invia al cliente
          </Button>
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

      {invio ? (
        <DialogoInvio
          invoiceId={invoiceId}
          kind={kind}
          code={code}
          open={invio}
          onOpenChange={setInvio}
          customerEmail={customerEmail}
          customerName={customerName}
        />
      ) : null}
    </>
  )
}

/**
 * L'invio del documento al cliente, con il PDF in allegato.
 *
 * "Inviata" viene scritto sul documento solo se il messaggio parte davvero:
 * se il fornitore di posta manca o rifiuta, il documento resta "emessa" e il
 * messaggio aspetta in coda. Uno stato che dice "il cliente ce l'ha" quando
 * non è vero è peggio di nessuno stato.
 */
function DialogoInvio({
  invoiceId,
  kind,
  code,
  open,
  onOpenChange,
  customerEmail,
  customerName,
}: {
  invoiceId: string
  kind: Enums['invoice_kind']
  code: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  customerEmail: string | null
  customerName: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(inviaFatturaEmailAction, IDLE)
  const [allega, setAllega] = useState(true)

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Documento inviato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const nome = kind === 'nota_credito' ? 'la nota di credito' : 'la fattura'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              Inviare {nome} {code}
              {customerName ? ` a ${customerName}` : ''}?
            </DialogTitle>
            <DialogDescription>
              Il messaggio riporta numero, data, totale e scadenza. Il documento in PDF viaggia in
              allegato.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="invoice_id" value={invoiceId} />

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

            <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="min-w-0">
                <p className="text-small font-medium text-text">Allega il PDF</p>
                <p className="mt-0.5 text-caption text-text-muted">
                  Senza allegato il messaggio resta valido, ma il cliente dovrà chiedere il
                  documento.
                </p>
              </div>
              <Switch
                name="allega_pdf"
                checked={allega}
                onCheckedChange={setAllega}
                aria-label="Allega il PDF"
              />
            </div>

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
