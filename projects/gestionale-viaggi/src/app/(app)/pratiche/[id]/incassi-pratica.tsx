'use client'

import {
  BanknoteArrowUp,
  CalendarClock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Undo2,
  Wallet,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { InstallmentStateBadge, PayoutStatusBadge } from '@/components/domain/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Input, Textarea } from '@/components/ui/input'
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
  TableCellNumeric,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { IDLE, type ActionState } from '@/lib/action-state'
import { formatDateShort, formatRelativeDays, toDateInput } from '@/lib/date'
import {
  INSTALLMENT_KIND,
  PAYMENT_IN_KIND,
  PAYMENT_METHOD,
  plurale,
} from '@/lib/labels'
import { centsToInputValue, formatEuro } from '@/lib/money'
import {
  deleteInstallmentAction,
  recordPaymentInAction,
  saveInstallmentAction,
  setPayoutStatusAction,
  syncPayoutsAction,
  voidPaymentInAction,
} from '@/server/actions/incassi'
import type { InstallmentRow, PaymentInRow, PayoutRow } from '@/server/queries/incassi'

const METODI = [
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'contanti', label: 'Contanti' },
  { value: 'pos', label: 'POS' },
  { value: 'assegno', label: 'Assegno' },
  { value: 'link_pagamento', label: 'Link di pagamento' },
  { value: 'compensazione', label: 'Compensazione' },
]

const TIPI_INCASSO = [
  { value: 'acconto', label: 'Acconto' },
  { value: 'saldo', label: 'Saldo' },
  { value: 'extra', label: 'Extra' },
  { value: 'rimborso', label: 'Rimborso al cliente' },
]

const TIPI_RATA = [
  { value: 'acconto', label: 'Acconto' },
  { value: 'saldo', label: 'Saldo' },
  { value: 'rata', label: 'Rata' },
]

const oggiIso = () => new Date().toISOString().slice(0, 10)

/** Legge dallo stato dell'azione il valore digitato, per non svuotare il modulo. */
function valoreIniziale(state: ActionState, campo: string, ripiego = ''): string {
  return state.values?.[campo] ?? ripiego
}

export function IncassiPratica({
  bookingId,
  bookingCode,
  installments,
  paymentsIn,
  payouts,
  residuoCents,
  depositHint,
  canManage,
  rataDaIncassare,
}: {
  bookingId: string
  bookingCode: string
  installments: readonly InstallmentRow[]
  paymentsIn: readonly PaymentInRow[]
  payouts: readonly PayoutRow[]
  residuoCents: number
  depositHint: string
  canManage: boolean
  /** Scadenza arrivata dallo scadenzario: il modulo si apre già su quella. */
  rataDaIncassare?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [incassoAperto, setIncassoAperto] = useState(Boolean(rataDaIncassare))
  const [rataScelta, setRataScelta] = useState<string | null>(rataDaIncassare ?? null)
  const [rataAperta, setRataAperta] = useState<InstallmentRow | null>(null)
  const [rataNuova, setRataNuova] = useState(false)
  // I due moduli seguenti vivono qui e non dentro la riga: quando l'azione
  // riesce, la riga che li conteneva sparisce con l'elenco aggiornato, e con
  // essa sparirebbe l'effetto che chiude il modulo e mostra l'esito.
  const [daStornare, setDaStornare] = useState<PaymentInRow | null>(null)
  const [pagamentoAperto, setPagamentoAperto] = useState<PayoutRow | null>(null)

  function allinea() {
    startTransition(async () => {
      const esito = await syncPayoutsAction(bookingId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Pagamenti allineati.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti ad allineare i pagamenti.')
      }
    })
  }

  function togliRata(id: string) {
    startTransition(async () => {
      const esito = await deleteInstallmentAction(id, bookingId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Scadenza rimossa.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a togliere la scadenza.')
      }
    })
  }

  const aperte = installments.filter((rata) => (rata.residual_cents ?? 0) > 0)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Scadenze verso il cliente</CardTitle>
              <p className="text-small text-text-muted">{depositHint}</p>
            </div>
            {canManage && installments.length > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => setRataNuova(true)}>
                <Plus aria-hidden="true" />
                Aggiungi una scadenza
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {installments.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CalendarClock />}
                title="Nessuna scadenza"
                description="Conferma la pratica e le scadenze vengono generate secondo i parametri dell’agenzia, oppure aggiungile a mano."
                action={
                  canManage ? (
                    <Button variant="primary" onClick={() => setRataNuova(true)}>
                      Aggiungi la prima scadenza
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
                <Table>
                  <caption className="sr-only">Scadenze di pagamento del cliente</caption>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Tipo</TableHeaderCell>
                      <TableHeaderCell>Scadenza</TableHeaderCell>
                      <TableHeaderCell className="text-right">Importo</TableHeaderCell>
                      <TableHeaderCell className="text-right">Incassato</TableHeaderCell>
                      <TableHeaderCell className="text-right">Residuo</TableHeaderCell>
                      <TableHeaderCell>Stato</TableHeaderCell>
                      {canManage ? (
                        <TableHeaderCell className="w-24 text-right">Azioni</TableHeaderCell>
                      ) : null}
                    </tr>
                  </TableHead>
                  <TableBody>
                    {installments.map((rata) => (
                      <TableRow key={rata.id}>
                        <TableCell>{rata.kind ? INSTALLMENT_KIND[rata.kind] : '—'}</TableCell>
                        <TableCell className="num">
                          {formatDateShort(rata.due_date)}
                          <span className="ml-2 text-caption text-text-muted">
                            {rata.is_late
                              ? plurale(rata.days_late ?? 0, 'giorno di ritardo', 'giorni di ritardo')
                              : formatRelativeDays(rata.due_date)}
                          </span>
                        </TableCell>
                        <TableCellNumeric className="font-medium" data-rata="importo">
                          {formatEuro(rata.amount_cents ?? 0)}
                        </TableCellNumeric>
                        <TableCellNumeric className="text-text-muted">
                          {formatEuro(rata.covered_cents ?? 0)}
                        </TableCellNumeric>
                        <TableCellNumeric className="font-medium">
                          {formatEuro(rata.residual_cents ?? 0)}
                        </TableCellNumeric>
                        <TableCell>
                          <InstallmentStateBadge state={rata.state} />
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Modifica la scadenza del ${formatDateShort(rata.due_date)}`}
                                onClick={() => setRataAperta(rata)}
                              >
                                <Pencil className="size-3.5" aria-hidden="true" />
                              </Button>
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Togli la scadenza del ${formatDateShort(rata.due_date)}`}
                                  >
                                    <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                                  </Button>
                                }
                                title="Togliere questa scadenza?"
                                description="Gli incassi già registrati restano: cambia solo il piano delle scadenze di questa pratica."
                                confirmLabel="Togli"
                                onConfirm={() => togliRata(rata.id ?? '')}
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>

              <ul className="space-y-2 p-3 md:hidden">
                {installments.map((rata) => (
                  <li
                    key={rata.id}
                    className="rounded-lg border border-border bg-surface p-3 shadow-e1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="num font-medium text-text">
                          {formatDateShort(rata.due_date)}
                        </p>
                        <p className="text-caption text-text-muted">
                          {rata.kind ? INSTALLMENT_KIND[rata.kind] : '—'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="num font-medium" data-rata="importo">
                          {formatEuro(rata.amount_cents ?? 0)}
                        </span>
                        {(rata.covered_cents ?? 0) > 0 ? (
                          <p className="num text-caption text-text-muted">
                            residuo {formatEuro(rata.residual_cents ?? 0)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <InstallmentStateBadge state={rata.state} />
                      {canManage ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Modifica la scadenza del ${formatDateShort(rata.due_date)}`}
                            onClick={() => setRataAperta(rata)}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Modifica
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Incassi registrati</CardTitle>
              <p className="text-small text-text-muted">
                {residuoCents > 0
                  ? `Restano ${formatEuro(residuoCents)} da incassare su questa pratica.`
                  : 'La pratica è interamente incassata.'}
              </p>
            </div>
            {canManage ? (
              <Button variant="primary" size="sm" onClick={() => setIncassoAperto(true)}>
                <Wallet aria-hidden="true" />
                Registra un incasso
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsIn.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Wallet />}
                title="Nessun incasso"
                description="Ogni bonifico, contante o POS registrato qui aggiorna il residuo della pratica e chiude la scadenza corrispondente."
              />
            </div>
          ) : (
            <>
              <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
                <Table>
                  <caption className="sr-only">Incassi della pratica</caption>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Data</TableHeaderCell>
                      <TableHeaderCell>Tipo</TableHeaderCell>
                      <TableHeaderCell>Metodo</TableHeaderCell>
                      <TableHeaderCell>Riferimento</TableHeaderCell>
                      <TableHeaderCell className="text-right">Importo</TableHeaderCell>
                      {canManage ? (
                        <TableHeaderCell className="w-20 text-right">Azioni</TableHeaderCell>
                      ) : null}
                    </tr>
                  </TableHead>
                  <TableBody>
                    {paymentsIn.map((incasso) => (
                      <TableRow key={incasso.id}>
                        <TableCell className="num">{formatDateShort(incasso.paid_at)}</TableCell>
                        <TableCell>{incasso.kind ? PAYMENT_IN_KIND[incasso.kind] : '—'}</TableCell>
                        <TableCell>
                          {incasso.method ? PAYMENT_METHOD[incasso.method] : '—'}
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-text-muted">
                          {incasso.reference ?? '—'}
                        </TableCell>
                        <TableCellNumeric
                          className={
                            (incasso.amount_cents ?? 0) < 0
                              ? 'font-medium text-danger'
                              : 'font-medium text-success'
                          }
                        >
                          {formatEuro(incasso.amount_cents ?? 0)}
                        </TableCellNumeric>
                        {canManage ? (
                          <TableCell className="text-right">
                            <BottoneStorno
                              incasso={incasso}
                              onApri={() => setDaStornare(incasso)}
                            />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>

              <ul className="space-y-2 p-3 md:hidden">
                {paymentsIn.map((incasso) => (
                  <li
                    key={incasso.id}
                    className="rounded-lg border border-border bg-surface p-3 shadow-e1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="num font-medium text-text">
                          {formatDateShort(incasso.paid_at)}
                        </p>
                        <p className="text-caption text-text-muted">
                          {[
                            incasso.kind ? PAYMENT_IN_KIND[incasso.kind] : null,
                            incasso.method ? PAYMENT_METHOD[incasso.method] : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span
                        className={
                          (incasso.amount_cents ?? 0) < 0
                            ? 'num shrink-0 font-medium text-danger'
                            : 'num shrink-0 font-medium text-success'
                        }
                      >
                        {formatEuro(incasso.amount_cents ?? 0)}
                      </span>
                    </div>
                    {canManage ? (
                      <div className="mt-2 flex justify-end">
                        <BottoneStorno
                          incasso={incasso}
                          onApri={() => setDaStornare(incasso)}
                          esteso
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Pagamenti ai fornitori</CardTitle>
              <p className="text-small text-text-muted">
                Nascono dalle righe di servizio con un fornitore: importo netto e scadenza di
                pagamento.
              </p>
            </div>
            {canManage ? (
              <Button variant="secondary" size="sm" onClick={allinea}>
                <RefreshCw aria-hidden="true" />
                Allinea dai servizi
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<BanknoteArrowUp />}
                title="Nessun pagamento da fare"
                description="Indica il fornitore sulle righe di servizio, poi usa «Allinea dai servizi»: le scadenze verso i fornitori nascono da lì."
              />
            </div>
          ) : (
            <>
              <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
                <Table>
                  <caption className="sr-only">Pagamenti ai fornitori della pratica</caption>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Fornitore</TableHeaderCell>
                      <TableHeaderCell>Servizio</TableHeaderCell>
                      <TableHeaderCell>Scadenza</TableHeaderCell>
                      <TableHeaderCell className="text-right">Importo</TableHeaderCell>
                      <TableHeaderCell>Stato</TableHeaderCell>
                      {canManage ? (
                        <TableHeaderCell className="w-32 text-right">Azioni</TableHeaderCell>
                      ) : null}
                    </tr>
                  </TableHead>
                  <TableBody>
                    {payouts.map((pagamento) => (
                      <TableRow key={pagamento.id}>
                        <TableCell className="font-medium text-text">
                          {pagamento.supplier_name ?? '—'}
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-text-muted">
                          {pagamento.service_description ?? '—'}
                        </TableCell>
                        <TableCell className="num">
                          {formatDateShort(pagamento.due_date)}
                          {pagamento.is_late ? (
                            <span className="ml-2 text-caption font-medium text-danger">
                              in ritardo
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCellNumeric className="font-medium">
                          {formatEuro(pagamento.amount_cents ?? 0)}
                        </TableCellNumeric>
                        <TableCell>
                          {pagamento.status ? <PayoutStatusBadge status={pagamento.status} /> : null}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <BottonePagamento
                              pagamento={pagamento}
                              onApri={() => setPagamentoAperto(pagamento)}
                            />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>

              <ul className="space-y-2 p-3 md:hidden">
                {payouts.map((pagamento) => (
                  <li
                    key={pagamento.id}
                    className="rounded-lg border border-border bg-surface p-3 shadow-e1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">
                          {pagamento.supplier_name ?? '—'}
                        </p>
                        <p className="num text-caption text-text-muted">
                          {formatDateShort(pagamento.due_date)}
                        </p>
                      </div>
                      <span className="num shrink-0 font-medium">
                        {formatEuro(pagamento.amount_cents ?? 0)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {pagamento.status ? <PayoutStatusBadge status={pagamento.status} /> : null}
                      {canManage ? (
                        <BottonePagamento
                          pagamento={pagamento}
                          onApri={() => setPagamentoAperto(pagamento)}
                          esteso
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <DialogoIncasso
            bookingId={bookingId}
            bookingCode={bookingCode}
            open={incassoAperto}
            onOpenChange={(valore) => {
              setIncassoAperto(valore)
              if (!valore) setRataScelta(null)
            }}
            rate={aperte}
            rataScelta={rataScelta}
            residuoCents={residuoCents}
          />
          <DialogoRata
            bookingId={bookingId}
            open={rataNuova || rataAperta !== null}
            rata={rataAperta}
            onOpenChange={(valore) => {
              if (!valore) {
                setRataNuova(false)
                setRataAperta(null)
              }
            }}
          />
          <DialogoStorno
            bookingId={bookingId}
            incasso={daStornare}
            onOpenChange={(valore) => {
              if (!valore) setDaStornare(null)
            }}
          />
          <DialogoPagamento
            pagamento={pagamentoAperto}
            onOpenChange={(valore) => {
              if (!valore) setPagamentoAperto(null)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

// --- Registrazione di un incasso ----------------------------------------------
function DialogoIncasso({
  bookingId,
  bookingCode,
  open,
  onOpenChange,
  rate,
  rataScelta,
  residuoCents,
}: {
  bookingId: string
  bookingCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
  rate: readonly InstallmentRow[]
  rataScelta: string | null
  residuoCents: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(recordPaymentInAction, IDLE)
  const [tipo, setTipo] = useState('acconto')
  const [metodo, setMetodo] = useState('bonifico')
  // La scadenza proposta è la prima ancora aperta: chi incassa sta quasi sempre
  // chiudendo quella, e trovarsela già scelta evita un passaggio a ogni riga.
  const predefinita = rataScelta ?? rate[0]?.id ?? 'nessuna'
  const [rata, setRata] = useState(predefinita)

  useEffect(() => {
    setRata(predefinita)
  }, [predefinita])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Incasso registrato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // L'importo proposto è il residuo della scadenza scelta, o quello della
  // pratica: nella maggior parte dei casi è esattamente quello che è arrivato.
  const rataCorrente = rate.find((riga) => riga.id === rata)
  const proposto = rataCorrente?.residual_cents ?? residuoCents

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Registra un incasso</DialogTitle>
            <DialogDescription>
              Pratica {bookingCode}. L’incasso aggiorna il residuo e chiude la scadenza coperta.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            <input type="hidden" name="installment_id" value={rata} />
            <input type="hidden" name="kind" value={tipo} />
            <input type="hidden" name="method" value={metodo} />

            {rate.length > 0 ? (
              <Field label="Scadenza" hint="A quale scadenza si riferisce.">
                {(props) => (
                  <Select value={rata} onValueChange={setRata}>
                    <SelectTrigger {...props} aria-label="Scadenza">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuna">Nessuna scadenza in particolare</SelectItem>
                      {rate.map((riga) => (
                        <SelectItem key={riga.id} value={riga.id ?? ''}>
                          {`${riga.kind ? INSTALLMENT_KIND[riga.kind] : 'Rata'} del ${formatDateShort(riga.due_date)} · ${formatEuro(riga.residual_cents ?? 0)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Importo" required error={state.fieldErrors?.amount}>
                {(props) => (
                  <Input {...props}
                    name="amount"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={valoreIniziale(
                      state,
                      'amount',
                      proposto > 0 ? centsToInputValue(proposto) : '',
                    )}
                  />
                )}
              </Field>

              <Field
                label="Data dell’incasso"
                required
                error={state.fieldErrors?.paid_at}
              >
                {(props) => (
                  <Input {...props}
                    name="paid_at"
                    type="date"
                    max={oggiIso()}
                    defaultValue={valoreIniziale(state, 'paid_at', oggiIso())}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                {(props) => (
                  <Select value={tipo} onValueChange={setTipo}>
                    <SelectTrigger {...props} aria-label="Tipo di incasso">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPI_INCASSO.map((opzione) => (
                        <SelectItem key={opzione.value} value={opzione.value}>
                          {opzione.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Metodo">
                {(props) => (
                  <Select value={metodo} onValueChange={setMetodo}>
                    <SelectTrigger {...props} aria-label="Metodo di pagamento">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METODI.map((opzione) => (
                        <SelectItem key={opzione.value} value={opzione.value}>
                          {opzione.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            {tipo === 'rimborso' ? (
              <p className="rounded-md bg-surface-2 p-2.5 text-caption text-text-muted">
                Un rimborso esce dalla cassa: scrivilo con il segno meno, per esempio
                <span className="num"> -150,00</span>.
              </p>
            ) : null}

            <Field
              label="Riferimento"
              hint="Numero del bonifico, dello scontrino o della ricevuta."
            >
              {(props) => (
                <Input {...props}
                  name="reference"
                  defaultValue={valoreIniziale(state, 'reference')}
                />
              )}
            </Field>

            <Field label="Note">
              {(props) => (
                <Textarea {...props}
                  name="notes"
                  rows={2}
                  defaultValue={valoreIniziale(state, 'notes')}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Registrazione...">Registra l’incasso</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Scadenza -----------------------------------------------------------------
function DialogoRata({
  bookingId,
  open,
  rata,
  onOpenChange,
}: {
  bookingId: string
  open: boolean
  rata: InstallmentRow | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(saveInstallmentAction, IDLE)
  const [tipo, setTipo] = useState(rata?.kind ?? 'rata')

  useEffect(() => {
    setTipo(rata?.kind ?? 'rata')
  }, [rata])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Scadenza salvata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{rata ? 'Modifica la scadenza' : 'Nuova scadenza'}</DialogTitle>
            <DialogDescription>
              Le scadenze dicono quando il cliente deve pagare. Gli incassi le coprono in ordine di
              data.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            {rata ? <input type="hidden" name="id" value={rata.id ?? ''} /> : null}
            <input type="hidden" name="kind" value={tipo} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                {(props) => (
                  <Select value={tipo} onValueChange={(valore) => setTipo(valore as typeof tipo)}>
                    <SelectTrigger {...props} aria-label="Tipo di scadenza">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPI_RATA.map((opzione) => (
                        <SelectItem key={opzione.value} value={opzione.value}>
                          {opzione.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field
                label="Scadenza"
                required
                error={state.fieldErrors?.due_date}
              >
                {(props) => (
                  <Input {...props}
                    name="due_date"
                    type="date"
                    defaultValue={valoreIniziale(state, 'due_date', toDateInput(rata?.due_date))}
                  />
                )}
              </Field>
            </div>

            <Field label="Importo" required error={state.fieldErrors?.amount}>
              {(props) => (
                <Input {...props}
                  name="amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  defaultValue={valoreIniziale(
                    state,
                    'amount',
                    rata ? centsToInputValue(rata.amount_cents ?? 0) : '',
                  )}
                />
              )}
            </Field>

            <Field label="Note">
              {(props) => (
                <Input {...props}
                  name="notes"
                  defaultValue={valoreIniziale(state, 'notes', rata?.notes ?? '')}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Salvataggio...">Salva</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
// --- Storno di un incasso -----------------------------------------------------
/** Solo il comando: il modulo vive nel componente padre. */
function BottoneStorno({
  incasso,
  onApri,
  esteso = false,
}: {
  incasso: PaymentInRow
  onApri: () => void
  esteso?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size={esteso ? 'sm' : 'icon-sm'}
      aria-label={`Storna l’incasso di ${formatEuro(incasso.amount_cents ?? 0)} del ${formatDateShort(incasso.paid_at)}`}
      onClick={onApri}
    >
      <Undo2 className="size-3.5 text-danger" aria-hidden="true" />
      {esteso ? 'Storna' : null}
    </Button>
  )
}

function DialogoStorno({
  bookingId,
  incasso,
  onOpenChange,
}: {
  bookingId: string
  incasso: PaymentInRow | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(voidPaymentInAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Incasso stornato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const etichetta = incasso
    ? `${formatEuro(incasso.amount_cents ?? 0)} del ${formatDateShort(incasso.paid_at)}`
    : ''

  return (
    <Dialog open={incasso !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Stornare l’incasso?</DialogTitle>
            <DialogDescription>
              {etichetta}. L’incasso non viene cancellato: resta nel registro con il motivo dello
              storno, e il residuo della pratica torna a comprenderlo.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="payment_id" value={incasso?.id ?? ''} />
            <input type="hidden" name="booking_id" value={bookingId} />

            <Field label="Motivo" required error={state.fieldErrors?.reason}>
              {(props) => (
                <Textarea
                  {...props}
                  name="reason"
                  rows={3}
                  placeholder="Bonifico tornato indietro, importo sbagliato, doppia registrazione…"
                  defaultValue={valoreIniziale(state, 'reason')}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton variant="danger" pendingLabel="Storno...">
              Storna
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Stato di un pagamento al fornitore ---------------------------------------
function BottonePagamento({
  pagamento,
  onApri,
  esteso = false,
}: {
  pagamento: PayoutRow
  onApri: () => void
  esteso?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size={esteso ? 'sm' : 'icon-sm'}
      aria-label={`Aggiorna il pagamento a ${pagamento.supplier_name ?? 'fornitore'} di ${formatEuro(pagamento.amount_cents ?? 0)}`}
      onClick={onApri}
    >
      <BanknoteArrowUp className="size-3.5" aria-hidden="true" />
      {esteso ? 'Aggiorna' : null}
    </Button>
  )
}

function DialogoPagamento({
  pagamento,
  onOpenChange,
}: {
  pagamento: PayoutRow | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(setPayoutStatusAction, IDLE)
  const [stato, setStato] = useState(pagamento?.status ?? 'da_pagare')
  const [metodo, setMetodo] = useState(pagamento?.method ?? 'bonifico')

  // Riaprendo il modulo su un'altra riga i campi devono raccontare quella riga,
  // non quella di prima.
  useEffect(() => {
    setStato(pagamento?.status ?? 'da_pagare')
    setMetodo(pagamento?.method ?? 'bonifico')
  }, [pagamento])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Pagamento aggiornato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const etichetta = pagamento
    ? `${pagamento.supplier_name ?? 'fornitore'} · ${formatEuro(pagamento.amount_cents ?? 0)}`
    : ''

  return (
    <Dialog open={pagamento !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Pagamento al fornitore</DialogTitle>
            <DialogDescription>{etichetta}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="payout_id" value={pagamento?.id ?? ''} />
            <input type="hidden" name="status" value={stato} />
            <input type="hidden" name="method" value={metodo} />

            <Field label="Stato">
              {(props) => (
                <Select value={stato} onValueChange={(valore) => setStato(valore as typeof stato)}>
                  <SelectTrigger {...props} aria-label="Stato del pagamento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="da_pagare">Da pagare</SelectItem>
                    <SelectItem value="programmato">Programmato</SelectItem>
                    <SelectItem value="pagato">Pagato</SelectItem>
                    <SelectItem value="stornato">Stornato</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {stato === 'pagato' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pagato il" error={state.fieldErrors?.paid_at}>
                  {(props) => (
                    <Input
                      {...props}
                      name="paid_at"
                      type="date"
                      max={oggiIso()}
                      defaultValue={valoreIniziale(
                        state,
                        'paid_at',
                        pagamento?.paid_at ?? oggiIso(),
                      )}
                    />
                  )}
                </Field>

                <Field label="Metodo">
                  {(props) => (
                    <Select
                      value={metodo}
                      onValueChange={(valore) => setMetodo(valore as typeof metodo)}
                    >
                      <SelectTrigger {...props} aria-label="Metodo di pagamento">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {METODI.map((opzione) => (
                          <SelectItem key={opzione.value} value={opzione.value}>
                            {opzione.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}

            <Field label="Fattura del fornitore">
              {(props) => (
                <Input
                  {...props}
                  name="supplier_invoice_number"
                  defaultValue={valoreIniziale(
                    state,
                    'supplier_invoice_number',
                    pagamento?.supplier_invoice_number ?? '',
                  )}
                />
              )}
            </Field>

            <Field label="Riferimento">
              {(props) => (
                <Input
                  {...props}
                  name="reference"
                  defaultValue={valoreIniziale(state, 'reference', pagamento?.reference ?? '')}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Salvataggio...">Salva</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
