'use client'

import { Plus, UserMinus, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Badge } from '@/components/ui/badge'
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
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import { formatDateShort } from '@/lib/date'
import { addBookingPassengerAction, removeBookingPassengerAction } from '@/server/actions/pratiche'
import type { BookingPassengerRow } from '@/server/queries/pratiche'

/** Come si legge lo stato del documento di un passeggero, con testo e colore. */
const DOCUMENT_STATE: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  valido: { label: 'In regola', tone: 'success' },
  senza_scadenza: { label: 'Senza scadenza', tone: 'neutral' },
  assente: { label: 'Documento assente', tone: 'warning' },
  scaduto: { label: 'Documento scaduto', tone: 'danger' },
  scade_prima_del_rientro: { label: 'Scade prima del rientro', tone: 'danger' },
}

const ROLES = [
  { value: 'titolare', label: 'Titolare della pratica' },
  { value: 'accompagnatore', label: 'Accompagnatore' },
  { value: 'minore', label: 'Minore' },
]

export function PasseggeriPratica({
  bookingId,
  passengers,
  candidates,
  canWrite,
}: {
  bookingId: string
  passengers: readonly BookingPassengerRow[]
  candidates: ReadonlyArray<{ id: string; label: string }>
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [state, submit] = useActionState(addBookingPassengerAction, IDLE)
  const [passengerId, setPassengerId] = useState('')
  const [role, setRole] = useState('accompagnatore')

  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false)
      setPassengerId('')
      toast.success(state.message ?? 'Passeggero aggiunto.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function rimuovi(id: string) {
    startTransition(async () => {
      const esito = await removeBookingPassengerAction(id, bookingId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Passeggero rimosso.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a rimuovere il passeggero.')
      }
    })
  }

  // Chi è già nella pratica non deve comparire fra i candidati.
  const gia = new Set(passengers.map((riga) => riga.passenger_id))
  const disponibili = candidates.filter((candidate) => !gia.has(candidate.id))

  return (
    <div className="space-y-3">
      {canWrite && passengers.length > 0 ? (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            Aggiungi un passeggero
          </Button>
        </div>
      ) : null}

      {passengers.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Nessun passeggero collegato"
          description="Chi viaggia non è sempre chi paga: collega qui i passeggeri, con il loro documento di viaggio."
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => setOpen(true)}>
                Aggiungi il primo passeggero
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrapper className="hidden md:block">
            <Table>
              <caption className="sr-only">Passeggeri della pratica</caption>
              <TableHead>
                <tr>
                  <TableHeaderCell>Passeggero</TableHeaderCell>
                  <TableHeaderCell>Ruolo</TableHeaderCell>
                  <TableHeaderCell>Documento</TableHeaderCell>
                  <TableHeaderCell>Scadenza</TableHeaderCell>
                  <TableHeaderCell>Camera</TableHeaderCell>
                  {canWrite ? <TableHeaderCell className="w-20 text-right">Azioni</TableHeaderCell> : null}
                </tr>
              </TableHead>
              <TableBody>
                {passengers.map((riga) => {
                  const stato = DOCUMENT_STATE[riga.document_state ?? 'assente'] ?? DOCUMENT_STATE.assente
                  return (
                    <TableRow key={riga.id}>
                      <TableCell>
                        <Link
                          href={`/passeggeri/${riga.passenger_id}`}
                          className="font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                        >
                          {riga.full_name}
                        </Link>
                        <p className="text-caption text-text-muted">
                          {riga.birth_date ? `Nato il ${formatDateShort(riga.birth_date)}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        {ROLES.find((option) => option.value === riga.role)?.label ?? riga.role}
                      </TableCell>
                      <TableCell>
                        <Badge tone={stato?.tone ?? 'neutral'}>{stato?.label}</Badge>
                      </TableCell>
                      <TableCell className="num">
                        {formatDateShort(riga.document_expires_at)}
                      </TableCell>
                      <TableCell>{riga.room_label ?? '—'}</TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Rimuovi ${riga.full_name}`}
                              >
                                <UserMinus className="size-3.5 text-danger" aria-hidden="true" />
                              </Button>
                            }
                            title="Rimuovere il passeggero dalla pratica?"
                            description="La scheda del passeggero resta in anagrafica: viene tolto solo il collegamento a questa pratica."
                            confirmLabel="Rimuovi"
                            onConfirm={() => rimuovi(riga.id ?? '')}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableWrapper>

          <ul className="space-y-2 md:hidden">
            {passengers.map((riga) => {
              const stato = DOCUMENT_STATE[riga.document_state ?? 'assente'] ?? DOCUMENT_STATE.assente
              return (
                <li key={riga.id} className="rounded-lg border border-border bg-surface p-3 shadow-e1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/passeggeri/${riga.passenger_id}`}
                      className="min-w-0 flex-1 truncate font-medium text-text"
                    >
                      {riga.full_name}
                    </Link>
                    <Badge tone={stato?.tone ?? 'neutral'}>{stato?.label}</Badge>
                  </div>
                  <p className="mt-1 text-caption text-text-muted">
                    {[
                      ROLES.find((option) => option.value === riga.role)?.label,
                      riga.document_number,
                      riga.room_label,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {canWrite ? (
                    <div className="mt-2 flex justify-end">
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Rimuovi ${riga.full_name}`}
                          >
                            <UserMinus className="size-3.5 text-danger" aria-hidden="true" />
                            Rimuovi
                          </Button>
                        }
                        title="Rimuovere il passeggero dalla pratica?"
                        description="La scheda del passeggero resta in anagrafica."
                        confirmLabel="Rimuovi"
                        onConfirm={() => rimuovi(riga.id ?? '')}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form action={submit}>
            <DialogHeader>
              <DialogTitle>Aggiungi un passeggero</DialogTitle>
              <DialogDescription>
                Scegli chi viaggia fra i passeggeri già in anagrafica. Se manca, crealo prima dalla
                sezione Passeggeri.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <input type="hidden" name="booking_id" value={bookingId} />
              <input type="hidden" name="passenger_id" value={passengerId} />
              <input type="hidden" name="role" value={role} />

              <Field label="Passeggero" required error={state.fieldErrors?.passenger_id}>
                {(props) => (
                  <Select value={passengerId} onValueChange={setPassengerId}>
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder="Scegli il passeggero">
                        {disponibili.find((option) => option.id === passengerId)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {disponibili.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Ruolo" error={state.fieldErrors?.role}>
                {(props) => (
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger id={props.id}>
                      <SelectValue>
                        {ROLES.find((option) => option.value === role)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Camera" error={state.fieldErrors?.room_label}>
                  {(props) => <Input {...props} name="room_label" placeholder="Doppia vista mare" />}
                </Field>
                <Field label="Posto" error={state.fieldErrors?.seat_label}>
                  {(props) => <Input {...props} name="seat_label" placeholder="14A" />}
                </Field>
              </div>

              {disponibili.length === 0 ? (
                <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-caption text-text-muted">
                  Tutti i passeggeri in anagrafica sono già in questa pratica.{' '}
                  <Link href="/passeggeri/nuovo" className="underline underline-offset-2">
                    Creane uno nuovo
                  </Link>
                  .
                </p>
              ) : null}

              <FormMessage status={state.status} message={state.message} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <SubmitButton pendingLabel="Aggiunta...">Aggiungi</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
