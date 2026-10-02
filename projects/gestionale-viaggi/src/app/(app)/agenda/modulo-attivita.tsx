'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { IDLE, type ActionState } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { toDateTimeInput } from '@/lib/date'
import { TASK_PRIORITY } from '@/lib/labels'
import { saveTaskAction } from '@/server/actions/agenda'
import type { TaskRow } from '@/server/queries/agenda'

const TIPI: ReadonlyArray<{ value: Enums['task_kind']; label: string }> = [
  { value: 'generico', label: 'Da fare' },
  { value: 'richiamo_cliente', label: 'Richiamare il cliente' },
  { value: 'verifica_documenti', label: 'Verificare i documenti' },
  { value: 'scadenza_acconto', label: 'Sollecitare l’acconto' },
  { value: 'scadenza_saldo', label: 'Sollecitare il saldo' },
  { value: 'pagamento_fornitore', label: 'Pagare il fornitore' },
]

const PRIORITA: readonly Enums['task_priority'][] = ['bassa', 'media', 'alta', 'urgente']
const SENZA_ASSEGNATARIO = 'nessuno'

export interface ModuloAttivitaProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  /** Attività esistente da modificare; assente per una nuova. */
  readonly task?: TaskRow | null
  readonly operatori: ReadonlyArray<{ id: string; label: string }>
  readonly bookingId?: string | null
  readonly customerId?: string | null
  readonly defaultAssignee?: string | null
}

/**
 * Il modulo di un'attività, per crearla e per modificarla.
 *
 * Un solo componente per le due cose: i campi sono gli stessi, e due copie
 * avrebbero preso strade diverse al primo ritocco. La scadenza è data e ora
 * perché "richiamare il cliente entro le 18" è un'informazione diversa da
 * "entro oggi", e l'ora si legge nel fuso dell'agenzia.
 */
export function ModuloAttivita({
  open,
  onOpenChange,
  task,
  operatori,
  bookingId,
  customerId,
  defaultAssignee,
}: ModuloAttivitaProps) {
  const router = useRouter()
  const toast = useToast()
  const [state, setState] = useState<ActionState>(IDLE)
  const [invio, startInvio] = useTransition()

  const [tipo, setTipo] = useState<Enums['task_kind']>(task?.kind ?? 'generico')
  const [priorita, setPriorita] = useState<Enums['task_priority']>(task?.priority ?? 'media')
  const [assegnatario, setAssegnatario] = useState(
    task?.assignee_id ?? defaultAssignee ?? SENZA_ASSEGNATARIO,
  )

  /**
   * L'invio passa da `startTransition`, non da `<form action>`.
   *
   * L'agenda è una delle poche pagine il cui corpo sta dentro un confine
   * Suspense, e nella build di produzione un modulo inviato con
   * `useActionState` da una pagina così non riceve mai l'esito se l'azione
   * rivalida qualcosa: la scrittura riesce, ma la transizione non chiude, il
   * bottone resta su "Salvataggio..." e la finestra non si chiude più. Qui
   * l'azione si chiama e basta, e la pagina si rilegge da sé (DECISIONI 62).
   */
  function inviaModulo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const formData = new FormData(evento.currentTarget)
    startInvio(async () => {
      const esito = await saveTaskAction(state, formData)
      setState(esito)
      if (esito.status === 'success') {
        onOpenChange(false)
        toast.success(esito.message ?? 'Attività salvata.')
        router.refresh()
      }
    })
  }

  // I valori di partenza: quelli dell'attività che si sta modificando, oppure
  // quelli rimandati indietro da un tentativo finito in errore.
  const iniziale = (campo: string, ripiego: string | null | undefined) =>
    state.values?.[campo] ?? (ripiego ?? '')

  const nomeOperatore = operatori.find((voce) => voce.id === assegnatario)?.label

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={inviaModulo} noValidate>
          <DialogHeader>
            <DialogTitle>{task ? 'Modifica l’attività' : 'Nuova attività'}</DialogTitle>
            <DialogDescription>
              {task
                ? 'Le modifiche restano nel registro delle attività dell’agenzia.'
                : 'Serve a ricordare una cosa da fare: comparirà in agenda, e in ritardo se la scadenza passa.'}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {task ? <input type="hidden" name="id" value={task.id ?? ''} /> : null}
            {bookingId ? <input type="hidden" name="booking_id" value={bookingId} /> : null}
            {customerId ? <input type="hidden" name="customer_id" value={customerId} /> : null}
            <input type="hidden" name="kind" value={tipo} />
            <input type="hidden" name="priority" value={priorita} />
            <input type="hidden" name="assignee_id" value={assegnatario} />
            <input type="hidden" name="status" value={task?.status ?? 'aperto'} />

            <Field label="Che cosa c’è da fare" required error={state.fieldErrors?.title}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  maxLength={200}
                  placeholder="Richiamare la signora Bianchi per il saldo"
                  defaultValue={iniziale('title', task?.title)}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo" error={state.fieldErrors?.kind}>
                {(props) => (
                  <Select value={tipo} onValueChange={(value) => setTipo(value as Enums['task_kind'])}>
                    <SelectTrigger id={props.id}>
                      <SelectValue>{TIPI.find((voce) => voce.value === tipo)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TIPI.map((voce) => (
                        <SelectItem key={voce.value} value={voce.value}>
                          {voce.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Priorità" error={state.fieldErrors?.priority}>
                {(props) => (
                  <Select
                    value={priorita}
                    onValueChange={(value) => setPriorita(value as Enums['task_priority'])}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue>{TASK_PRIORITY[priorita].label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITA.map((voce) => (
                        <SelectItem key={voce} value={voce}>
                          {TASK_PRIORITY[voce].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field
                label="Scadenza"
                hint="Data e ora nel fuso dell’agenzia. Lasciala vuota se non c’è un termine."
                error={state.fieldErrors?.due_at}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="due_at"
                    type="datetime-local"
                    defaultValue={iniziale('due_at', toDateTimeInput(task?.due_at))}
                  />
                )}
              </Field>

              <Field label="Assegnata a" error={state.fieldErrors?.assignee_id}>
                {(props) => (
                  <Select value={assegnatario} onValueChange={setAssegnatario}>
                    <SelectTrigger id={props.id}>
                      <SelectValue>
                        {assegnatario === SENZA_ASSEGNATARIO ? 'Nessuno' : nomeOperatore}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SENZA_ASSEGNATARIO}>Nessuno</SelectItem>
                      {operatori.map((voce) => (
                        <SelectItem key={voce.id} value={voce.id}>
                          {voce.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Note" error={state.fieldErrors?.description}>
              {(props) => (
                <Textarea
                  {...props}
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={iniziale('description', task?.description)}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pending={invio} pendingLabel="Salvataggio...">
              {task ? 'Salva' : 'Crea l’attività'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Il comando "Nuova attività", con il suo modulo già collegato. */
export function NuovaAttivita({
  operatori,
  defaultAssignee,
  bookingId,
  customerId,
  etichetta = 'Nuova attività',
  variante = 'primary',
}: {
  operatori: ReadonlyArray<{ id: string; label: string }>
  defaultAssignee?: string | null
  bookingId?: string | null
  customerId?: string | null
  etichetta?: string
  variante?: 'primary' | 'secondary'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant={variante} size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {etichetta}
      </Button>
      {/* Il modulo si monta solo quando serve: così i campi ripartono puliti
          a ogni apertura, senza ricordare l'attività di prima. */}
      {open ? (
        <ModuloAttivita
          open={open}
          onOpenChange={setOpen}
          operatori={operatori}
          bookingId={bookingId}
          customerId={customerId}
          defaultAssignee={defaultAssignee}
        />
      ) : null}
    </>
  )
}
