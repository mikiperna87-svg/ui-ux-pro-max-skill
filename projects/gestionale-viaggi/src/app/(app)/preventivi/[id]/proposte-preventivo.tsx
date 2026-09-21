'use client'

import { Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import type { Enums } from '@/lib/database.types'
import { formatDateShort, toDateInput } from '@/lib/date'
import { QUOTE_VARIANT, SERVICE_TYPE, VAT_REGIME, plurale } from '@/lib/labels'
import { centsToInputValue, formatEuro } from '@/lib/money'
import { copyVariantAction, deleteQuoteItemAction, saveQuoteItemAction } from '@/server/actions/preventivi'
import type { QuoteItemRow, QuoteVariantTotals } from '@/server/queries/preventivi'

type Variante = Enums['quote_variant']

const VARIANTI: readonly Variante[] = ['base', 'consigliata', 'premium']

function valoreIniziale(state: ActionState, campo: string, ripiego = ''): string {
  return state.values?.[campo] ?? ripiego
}

/** Periodo di una riga, scritto corto: "12/07 → 19/07". */
function periodo(da: string | null, a: string | null): string {
  if (!da && !a) return '—'
  if (da && a) return `${formatDateShort(da).slice(0, 5)} → ${formatDateShort(a).slice(0, 5)}`
  return formatDateShort(da ?? a)
}

export function ProposteVarianti({
  quoteId,
  items,
  totals,
  suppliers,
  canWrite,
  showMargins,
  acceptedVariant,
  defaultVatBps,
  defaultVatRegime,
}: {
  quoteId: string
  items: readonly QuoteItemRow[]
  totals: readonly QuoteVariantTotals[]
  suppliers: ReadonlyArray<{ id: string; label: string; commissionBps: number }>
  canWrite: boolean
  showMargins: boolean
  acceptedVariant: Variante | null
  defaultVatBps: number
  defaultVatRegime: Enums['vat_regime']
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const [attiva, setAttiva] = useState<Variante>(acceptedVariant ?? 'consigliata')
  const [rigaAperta, setRigaAperta] = useState<QuoteItemRow | null>(null)
  const [rigaNuova, setRigaNuova] = useState<Variante | null>(null)
  const [copiaDa, setCopiaDa] = useState<Variante | null>(null)

  function elimina(id: string) {
    startTransition(async () => {
      const esito = await deleteQuoteItemAction(id, quoteId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Riga rimossa.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a togliere la riga.')
      }
    })
  }

  const totalePer = (variante: Variante) => totals.find((riga) => riga.variant === variante)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {VARIANTI.map((variante) => {
          const totale = totalePer(variante)
          const scelta = acceptedVariant === variante
          return (
            <button
              key={variante}
              type="button"
              onClick={() => setAttiva(variante)}
              aria-pressed={attiva === variante}
              className={[
                'rounded-lg border p-4 text-left transition-colors',
                attiva === variante
                  ? 'border-accent bg-accent-subtle/40'
                  : 'border-border bg-surface hover:border-border-strong',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-small font-medium text-text">{QUOTE_VARIANT[variante].label}</p>
                {scelta ? <Badge tone="success">Scelta dal cliente</Badge> : null}
              </div>
              <p className="num mt-2 text-metric-sm text-text">
                {formatEuro(totale?.revenue_cents ?? 0)}
              </p>
              <p className="mt-1.5 text-caption text-text-muted">
                {totale
                  ? plurale(totale.items_count ?? 0, 'voce', 'voci')
                  : 'Nessuna voce'}
                {showMargins && totale
                  ? ` · margine ${formatEuro(totale.margin_cents ?? 0)}`
                  : ''}
              </p>
            </button>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>{QUOTE_VARIANT[attiva].label}</CardTitle>
              <p className="text-small text-text-muted">{QUOTE_VARIANT[attiva].note}</p>
            </div>
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setCopiaDa(attiva)}>
                  <Copy aria-hidden="true" />
                  Copia da un’altra
                </Button>
                <Button variant="primary" size="sm" onClick={() => setRigaNuova(attiva)}>
                  <Plus aria-hidden="true" />
                  Aggiungi una voce
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs value={attiva} onValueChange={(valore) => setAttiva(valore as Variante)}>
            <TabsList className="mx-4 mt-3">
              {VARIANTI.map((variante) => (
                <TabsTrigger key={variante} value={variante}>
                  {QUOTE_VARIANT[variante].label}
                </TabsTrigger>
              ))}
            </TabsList>

            {VARIANTI.map((variante) => {
              const righe = items.filter((riga) => riga.variant === variante)
              const totale = totalePer(variante)

              return (
                <TabsContent key={variante} value={variante}>
                  {righe.length === 0 ? (
                    <div className="p-4">
                      <EmptyState
                        title="Questa proposta è vuota"
                        description="Aggiungi le voci una per una, oppure copiala da un’altra proposta e ritocca i prezzi."
                        action={
                          canWrite ? (
                            <Button variant="primary" onClick={() => setRigaNuova(variante)}>
                              Aggiungi la prima voce
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
                        <Table>
                          <caption className="sr-only">
                            Voci della proposta {QUOTE_VARIANT[variante].label}
                          </caption>
                          <TableHead>
                            <tr>
                              <TableHeaderCell>Voce</TableHeaderCell>
                              <TableHeaderCell>Periodo</TableHeaderCell>
                              <TableHeaderCell className="text-right">Prezzo</TableHeaderCell>
                              {showMargins ? (
                                <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                              ) : null}
                              <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                              {canWrite ? (
                                <TableHeaderCell className="w-24 text-right">Azioni</TableHeaderCell>
                              ) : null}
                            </tr>
                          </TableHead>
                          <TableBody>
                            {righe.map((riga) => (
                              <TableRow key={riga.id}>
                                <TableCell>
                                  <p className="font-medium text-text">{riga.description}</p>
                                  <p className="text-caption text-text-muted">
                                    {[
                                      riga.service_type ? SERVICE_TYPE[riga.service_type] : null,
                                      riga.supplier_name,
                                      (riga.quantity ?? 1) > 1
                                        ? `× ${riga.quantity}`
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                  {riga.details ? (
                                    <p className="mt-0.5 max-w-lg text-caption text-text-subtle">
                                      {riga.details}
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell className="num whitespace-nowrap">
                                  {periodo(riga.date_from, riga.date_to)}
                                </TableCell>
                                <TableCellNumeric className="font-medium">
                                  {formatEuro(riga.total_price_cents ?? 0)}
                                </TableCellNumeric>
                                {showMargins ? (
                                  <TableCellNumeric className="text-success">
                                    {formatEuro(riga.margin_cents ?? 0)}
                                  </TableCellNumeric>
                                ) : null}
                                <TableCellNumeric className="text-text-muted">
                                  {formatEuro(riga.vat_cents ?? 0)}
                                  <span className="ml-1 text-caption">
                                    {riga.vat_regime === 'art_74_ter' ? '74-ter' : ''}
                                  </span>
                                </TableCellNumeric>
                                {canWrite ? (
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Modifica ${riga.description}`}
                                        onClick={() => setRigaAperta(riga)}
                                      >
                                        <Pencil className="size-3.5" aria-hidden="true" />
                                      </Button>
                                      <ConfirmDialog
                                        trigger={
                                          <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`Togli ${riga.description}`}
                                          >
                                            <Trash2
                                              className="size-3.5 text-danger"
                                              aria-hidden="true"
                                            />
                                          </Button>
                                        }
                                        title="Togliere questa voce?"
                                        description="La voce sparisce da questa proposta. Le altre proposte non cambiano."
                                        confirmLabel="Togli"
                                        onConfirm={() => elimina(riga.id ?? '')}
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
                        {righe.map((riga) => (
                          <li
                            key={riga.id}
                            className="rounded-lg border border-border bg-surface p-3 shadow-e1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 font-medium text-text">
                                {riga.description}
                              </p>
                              <span className="num shrink-0 font-medium">
                                {formatEuro(riga.total_price_cents ?? 0)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-caption text-text-muted">
                              {[
                                riga.service_type ? SERVICE_TYPE[riga.service_type] : null,
                                periodo(riga.date_from, riga.date_to),
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                            {canWrite ? (
                              <div className="mt-2 flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Modifica ${riga.description}`}
                                  onClick={() => setRigaAperta(riga)}
                                >
                                  <Pencil className="size-3.5" aria-hidden="true" />
                                  Modifica
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border px-4 py-3">
                        <span className="text-small text-text-muted">
                          Totale {QUOTE_VARIANT[variante].label.toLowerCase()}
                        </span>
                        {showMargins ? (
                          <span className="num text-small text-text-muted">
                            margine {formatEuro(totale?.margin_cents ?? 0)}
                          </span>
                        ) : null}
                        <span className="num text-small text-text-muted">
                          di cui IVA {formatEuro(totale?.vat_cents ?? 0)}
                        </span>
                        <span className="num text-heading font-semibold text-text">
                          {formatEuro(totale?.revenue_cents ?? 0)}
                        </span>
                      </div>
                    </>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>

      {canWrite ? (
        <>
          <DialogoVoce
            quoteId={quoteId}
            variante={rigaAperta?.variant ?? rigaNuova ?? attiva}
            riga={rigaAperta}
            open={rigaNuova !== null || rigaAperta !== null}
            onOpenChange={(valore) => {
              if (!valore) {
                setRigaNuova(null)
                setRigaAperta(null)
              }
            }}
            suppliers={suppliers}
            defaultVatBps={defaultVatBps}
            defaultVatRegime={defaultVatRegime}
          />
          <DialogoCopia
            quoteId={quoteId}
            destinazione={copiaDa}
            onOpenChange={(valore) => {
              if (!valore) setCopiaDa(null)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

// --- Voce di una proposta -----------------------------------------------------
function DialogoVoce({
  quoteId,
  variante,
  riga,
  open,
  onOpenChange,
  suppliers,
  defaultVatBps,
  defaultVatRegime,
}: {
  quoteId: string
  variante: Variante
  riga: QuoteItemRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: ReadonlyArray<{ id: string; label: string; commissionBps: number }>
  defaultVatBps: number
  defaultVatRegime: Enums['vat_regime']
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(saveQuoteItemAction, IDLE)

  const [serviceType, setServiceType] = useState<Enums['service_type']>(
    riga?.service_type ?? 'pacchetto',
  )
  const [supplierId, setSupplierId] = useState(riga?.supplier_id ?? 'nessuno')
  const [vatRegime, setVatRegime] = useState<Enums['vat_regime']>(
    riga?.vat_regime ?? defaultVatRegime,
  )

  useEffect(() => {
    setServiceType(riga?.service_type ?? 'pacchetto')
    setSupplierId(riga?.supplier_id ?? 'nessuno')
    setVatRegime(riga?.vat_regime ?? defaultVatRegime)
  }, [riga, defaultVatRegime])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Voce salvata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>
              {riga ? 'Modifica la voce' : `Nuova voce · ${QUOTE_VARIANT[variante].label}`}
            </DialogTitle>
            <DialogDescription>
              Il cliente vede la descrizione, il dettaglio e il prezzo. Costo e margine restano
              all’agenzia.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="quote_id" value={quoteId} />
            <input type="hidden" name="variant" value={riga?.variant ?? variante} />
            {riga ? <input type="hidden" name="id" value={riga.id ?? ''} /> : null}
            <input type="hidden" name="service_type" value={serviceType} />
            <input type="hidden" name="supplier_id" value={supplierId} />
            <input type="hidden" name="vat_regime" value={vatRegime} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo di servizio" error={state.fieldErrors?.service_type}>
                {(props) => (
                  <Select
                    value={serviceType}
                    onValueChange={(valore) => setServiceType(valore as Enums['service_type'])}
                  >
                    <SelectTrigger {...props}>
                      <SelectValue>{SERVICE_TYPE[serviceType]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_TYPE).map(([valore, etichetta]) => (
                        <SelectItem key={valore} value={valore}>
                          {etichetta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Fornitore" error={state.fieldErrors?.supplier_id}>
                {(props) => (
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger {...props}>
                      <SelectValue>
                        {supplierId === 'nessuno'
                          ? 'Nessun fornitore'
                          : suppliers.find((f) => f.id === supplierId)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessun fornitore</SelectItem>
                      {suppliers.map((fornitore) => (
                        <SelectItem key={fornitore.id} value={fornitore.id}>
                          {fornitore.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <Field label="Descrizione" required error={state.fieldErrors?.description}>
              {(props) => (
                <Input
                  {...props}
                  name="description"
                  placeholder="Soggiorno 7 notti in mezza pensione"
                  defaultValue={valoreIniziale(state, 'description', riga?.description ?? '')}
                />
              )}
            </Field>

            <Field
              label="Dettaglio"
              hint="La riga che spiega al cliente che cosa cambia rispetto alle altre proposte."
            >
              {(props) => (
                <Textarea
                  {...props}
                  name="details"
                  rows={2}
                  defaultValue={valoreIniziale(state, 'details', riga?.details ?? '')}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dal">
                {(props) => (
                  <Input
                    {...props}
                    name="date_from"
                    type="date"
                    defaultValue={valoreIniziale(state, 'date_from', toDateInput(riga?.date_from))}
                  />
                )}
              </Field>
              <Field label="Al" error={state.fieldErrors?.date_to}>
                {(props) => (
                  <Input
                    {...props}
                    name="date_to"
                    type="date"
                    defaultValue={valoreIniziale(state, 'date_to', toDateInput(riga?.date_to))}
                  />
                )}
              </Field>
              <Field label="Quantità" error={state.fieldErrors?.quantity}>
                {(props) => (
                  <Input
                    {...props}
                    name="quantity"
                    type="number"
                    min={1}
                    defaultValue={valoreIniziale(state, 'quantity', String(riga?.quantity ?? 1))}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Costo netto unitario"
                hint="Quanto costa all’agenzia."
                error={state.fieldErrors?.unit_cost}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="unit_cost"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={valoreIniziale(
                      state,
                      'unit_cost',
                      riga ? centsToInputValue(riga.unit_cost_cents ?? 0) : '',
                    )}
                  />
                )}
              </Field>

              <Field
                label="Prezzo di vendita unitario"
                hint="Quanto paga il cliente, IVA inclusa."
                error={state.fieldErrors?.unit_price}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="unit_price"
                    inputMode="decimal"
                    placeholder="0,00"
                    defaultValue={valoreIniziale(
                      state,
                      'unit_price',
                      riga ? centsToInputValue(riga.unit_price_cents ?? 0) : '',
                    )}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Commissione (%)" error={state.fieldErrors?.commission_percent}>
                {(props) => (
                  <Input
                    {...props}
                    name="commission_percent"
                    inputMode="decimal"
                    defaultValue={valoreIniziale(
                      state,
                      'commission_percent',
                      String((riga?.commission_bps ?? 0) / 100).replace('.', ','),
                    )}
                  />
                )}
              </Field>

              <Field label="Aliquota IVA (%)" error={state.fieldErrors?.vat_percent}>
                {(props) => (
                  <Input
                    {...props}
                    name="vat_percent"
                    inputMode="decimal"
                    defaultValue={valoreIniziale(
                      state,
                      'vat_percent',
                      String((riga?.vat_bps ?? defaultVatBps) / 100).replace('.', ','),
                    )}
                  />
                )}
              </Field>

              <Field label="Regime IVA" hint={VAT_REGIME[vatRegime].note}>
                {(props) => (
                  <Select
                    value={vatRegime}
                    onValueChange={(valore) => setVatRegime(valore as Enums['vat_regime'])}
                  >
                    <SelectTrigger {...props}>
                      <SelectValue>{VAT_REGIME[vatRegime].label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VAT_REGIME).map(([valore, voce]) => (
                        <SelectItem key={valore} value={valore}>
                          {voce.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <input type="hidden" name="sort_order" value={riga?.sort_order ?? 0} />

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Salvataggio...">
              {riga ? 'Salva' : 'Aggiungi la voce'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Copia di una proposta ----------------------------------------------------
function DialogoCopia({
  quoteId,
  destinazione,
  onOpenChange,
}: {
  quoteId: string
  destinazione: Variante | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(copyVariantAction, IDLE)
  const [da, setDa] = useState<Variante>('consigliata')

  useEffect(() => {
    if (destinazione) setDa(destinazione === 'consigliata' ? 'base' : 'consigliata')
  }, [destinazione])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Proposta copiata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={destinazione !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>Copia una proposta</DialogTitle>
            <DialogDescription>
              Le voci vengono copiate in{' '}
              <strong>{destinazione ? QUOTE_VARIANT[destinazione].label : ''}</strong>, sostituendo
              quelle che ci sono già. Il ritocco vale sui prezzi, non sui costi.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="quote_id" value={quoteId} />
            <input type="hidden" name="to" value={destinazione ?? ''} />
            <input type="hidden" name="from" value={da} />

            <Field label="Copia da" error={state.fieldErrors?.from}>
              {(props) => (
                <Select value={da} onValueChange={(valore) => setDa(valore as Variante)}>
                  <SelectTrigger {...props}>
                    <SelectValue>{QUOTE_VARIANT[da].label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANTI.filter((variante) => variante !== destinazione).map((variante) => (
                      <SelectItem key={variante} value={variante}>
                        {QUOTE_VARIANT[variante].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Ritocco sui prezzi (%)"
              hint="Per esempio 20 per una proposta superiore, 0 per copiarla identica."
              error={state.fieldErrors?.adjust_percent}
            >
              {(props) => (
                <Input
                  {...props}
                  name="adjust_percent"
                  inputMode="decimal"
                  defaultValue={valoreIniziale(state, 'adjust_percent', '20')}
                />
              )}
            </Field>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Copia...">Copia le voci</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
