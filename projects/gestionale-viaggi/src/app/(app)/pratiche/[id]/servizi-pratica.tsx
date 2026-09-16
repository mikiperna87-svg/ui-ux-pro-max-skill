'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
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
import { IDLE } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { formatDateShort } from '@/lib/date'
import { SERVICE_TYPE, VAT_REGIME } from '@/lib/labels'
import { centsToInputValue, formatEuro, formatPercent } from '@/lib/money'
import { deleteBookingServiceAction, saveBookingServiceAction } from '@/server/actions/pratiche'
import type { BookingServiceRow } from '@/server/queries/pratiche'

/**
 * Periodo di una riga: "03/03 → 12/03/2027" invece di ripetere l'anno due
 * volte. In una tabella con sei colonne di importi, ogni carattere conta.
 */
function periodo(da: string | null, a: string | null): string {
  if (!da && !a) return '—'
  if (!a) return formatDateShort(da)
  if (!da) return `fino al ${formatDateShort(a)}`
  const stessoAnno = da.slice(0, 4) === a.slice(0, 4)
  const inizio = stessoAnno ? formatDateShort(da).slice(0, 5) : formatDateShort(da)
  return `${inizio} → ${formatDateShort(a)}`
}

export interface SupplierOption {
  readonly id: string
  readonly label: string
  readonly commissionBps: number
  readonly vatRegime: Enums['vat_regime']
  readonly paymentTermsDays: number
}

/**
 * Righe di servizio della pratica.
 *
 * Ogni riga porta costo netto, prezzo di vendita e commissione: il margine
 * della pratica è la somma dei margini di riga, ricalcolato dal database a ogni
 * salvataggio. Qui si mostra anche il dettaglio IVA, perché in regime 74-ter
 * l'imposta si calcola sul margine e non sul corrispettivo: chi vende deve
 * poterlo vedere in chiaro, non fidarsi.
 */
export function ServiziPratica({
  bookingId,
  services,
  suppliers,
  canWrite,
  showMargins,
  defaultVatBps,
  defaultVatRegime,
}: {
  bookingId: string
  services: readonly BookingServiceRow[]
  suppliers: readonly SupplierOption[]
  canWrite: boolean
  showMargins: boolean
  defaultVatBps: number
  defaultVatRegime: Enums['vat_regime']
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<BookingServiceRow | null>(null)

  function apri(service: BookingServiceRow | null) {
    setEditing(service)
    setOpen(true)
  }

  function elimina(id: string) {
    startTransition(async () => {
      const esito = await deleteBookingServiceAction(id, bookingId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Riga eliminata.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare la riga.')
      }
    })
  }

  // Sulle pratiche costruite su misura la commissione è sempre zero: mostrare
  // una colonna di zeri ruba spazio al margine, che è il numero che conta.
  const mostraCommissioni = services.some((riga) => (riga.commission_cents ?? 0) !== 0)

  const totali = services.reduce(
    (acc, riga) => ({
      price: acc.price + (riga.total_price_cents ?? 0),
      cost: acc.cost + (riga.total_cost_cents ?? 0),
      commission: acc.commission + (riga.commission_cents ?? 0),
      margin: acc.margin + (riga.margin_cents ?? 0),
      vat: acc.vat + (riga.vat_cents ?? 0),
    }),
    { price: 0, cost: 0, commission: 0, margin: 0, vat: 0 },
  )

  return (
    <div className="space-y-3">
      {canWrite && services.length > 0 ? (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => apri(null)}>
            <Plus aria-hidden="true" />
            Aggiungi una riga
          </Button>
        </div>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          icon={<Plus />}
          title="Nessun servizio inserito"
          description="Voli, hotel, transfer, assicurazioni: ogni riga porta il costo del fornitore e il prezzo praticato al cliente. Il margine si calcola da qui."
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => apri(null)}>
                Aggiungi la prima riga
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableWrapper className="hidden md:block">
            <Table>
              <caption className="sr-only">Righe di servizio della pratica</caption>
              <TableHead>
                <tr>
                  {/* Tipo, fornitore, quantità e codice stanno sotto la
                      descrizione: quattro colonne in meno, e la riga si legge
                      come la si racconta a voce. */}
                  <TableHeaderCell>Servizio</TableHeaderCell>
                  <TableHeaderCell>Periodo</TableHeaderCell>
                  {showMargins ? (
                    <TableHeaderCell className="text-right">Costo</TableHeaderCell>
                  ) : null}
                  <TableHeaderCell className="text-right">Vendita</TableHeaderCell>
                  {showMargins ? (
                    <>
                      {mostraCommissioni ? (
                        <TableHeaderCell className="text-right">Comm.</TableHeaderCell>
                      ) : null}
                      <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                    </>
                  ) : null}
                  <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                  {canWrite ? (
                    <TableHeaderCell className="w-20 px-1">
                      <span className="sr-only">Azioni</span>
                    </TableHeaderCell>
                  ) : null}
                </tr>
              </TableHead>
              <TableBody>
                {services.map((riga) => (
                  <TableRow key={riga.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium text-text">
                        {(riga.quantity ?? 1) > 1 ? (
                          <span className="num mr-1 text-text-muted">{riga.quantity}×</span>
                        ) : null}
                        {riga.description}
                      </p>
                      <p className="truncate text-caption text-text-muted">
                        {[
                          riga.service_type ? SERVICE_TYPE[riga.service_type] : null,
                          riga.supplier_name,
                          riga.confirmation_code,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-caption">
                      {periodo(riga.date_from, riga.date_to)}
                    </TableCell>
                    {showMargins ? (
                      <TableCellNumeric>{formatEuro(riga.total_cost_cents ?? 0)}</TableCellNumeric>
                    ) : null}
                    <TableCellNumeric className="font-medium">
                      {formatEuro(riga.total_price_cents ?? 0)}
                    </TableCellNumeric>
                    {showMargins ? (
                      <>
                        {mostraCommissioni ? (
                          <TableCellNumeric>
                            {formatEuro(riga.commission_cents ?? 0)}
                          </TableCellNumeric>
                        ) : null}
                        <TableCellNumeric className="text-success">
                          {formatEuro(riga.margin_cents ?? 0)}
                        </TableCellNumeric>
                      </>
                    ) : null}
                    <TableCellNumeric>
                      <span title={riga.vat_regime ? VAT_REGIME[riga.vat_regime].note : undefined}>
                        {formatEuro(riga.vat_cents ?? 0)}
                      </span>
                    </TableCellNumeric>
                    {canWrite ? (
                      <TableCell className="px-1 text-right">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Modifica ${riga.description}`}
                            onClick={() => apri(riga)}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Elimina ${riga.description}`}
                              >
                                <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                              </Button>
                            }
                            title="Eliminare la riga?"
                            description="Il margine e le scadenze della pratica vengono ricalcolati."
                            confirmLabel="Elimina"
                            onConfirm={() => elimina(riga.id ?? '')}
                          />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
              <tfoot className="border-t border-border-strong bg-surface-2">
                <tr>
                  <TableCell className="font-medium">Totale</TableCell>
                  <TableCell />
                  {showMargins ? <TableCellNumeric>{formatEuro(totali.cost)}</TableCellNumeric> : null}
                  <TableCellNumeric className="font-semibold">
                    {formatEuro(totali.price)}
                  </TableCellNumeric>
                  {showMargins ? (
                    <>
                      {mostraCommissioni ? (
                        <TableCellNumeric>{formatEuro(totali.commission)}</TableCellNumeric>
                      ) : null}
                      <TableCellNumeric className="font-semibold text-success">
                        {formatEuro(totali.margin)}
                      </TableCellNumeric>
                    </>
                  ) : null}
                  <TableCellNumeric>{formatEuro(totali.vat)}</TableCellNumeric>
                  {canWrite ? <TableCell /> : null}
                </tr>
              </tfoot>
            </Table>
          </TableWrapper>

          {/* Su telefono la tabella a nove colonne diventa un elenco di schede. */}
          <ul className="space-y-2 md:hidden">
            {services.map((riga) => (
              <li key={riga.id} className="rounded-lg border border-border bg-surface p-3 shadow-e1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-medium text-text">{riga.description}</p>
                  <span className="num shrink-0 font-medium">
                    {formatEuro(riga.total_price_cents ?? 0)}
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-muted">
                  {[riga.service_type ? SERVICE_TYPE[riga.service_type] : null, riga.supplier_name]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
                  <Badge tone="neutral">{riga.quantity}×</Badge>
                  {showMargins ? (
                    <Badge tone="success">Margine {formatEuro(riga.margin_cents ?? 0)}</Badge>
                  ) : null}
                  <Badge tone="neutral">IVA {formatEuro(riga.vat_cents ?? 0)}</Badge>
                </div>
                {canWrite ? (
                  <div className="mt-2 flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Modifica ${riga.description}`}
                      onClick={() => apri(riga)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Modifica
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" aria-label={`Elimina ${riga.description}`}>
                          <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                          Elimina
                        </Button>
                      }
                      title="Eliminare la riga?"
                      description="Il margine e le scadenze della pratica vengono ricalcolati."
                      confirmLabel="Elimina"
                      onConfirm={() => elimina(riga.id ?? '')}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <RigaServizioDialog
        key={editing?.id ?? 'nuova'}
        open={open}
        onOpenChange={setOpen}
        bookingId={bookingId}
        service={editing}
        suppliers={suppliers}
        defaultVatBps={defaultVatBps}
        defaultVatRegime={defaultVatRegime}
      />
    </div>
  )
}

function RigaServizioDialog({
  open,
  onOpenChange,
  bookingId,
  service,
  suppliers,
  defaultVatBps,
  defaultVatRegime,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  service: BookingServiceRow | null
  suppliers: readonly SupplierOption[]
  defaultVatBps: number
  defaultVatRegime: Enums['vat_regime']
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(saveBookingServiceAction, IDLE)

  const [serviceType, setServiceType] = useState<Enums['service_type']>(
    service?.service_type ?? 'pacchetto',
  )
  const [supplierId, setSupplierId] = useState(service?.supplier_id ?? 'nessuno')
  const [vatRegime, setVatRegime] = useState<Enums['vat_regime']>(
    service?.vat_regime ?? defaultVatRegime,
  )
  // Cambiando fornitore la commissione e il regime seguono le sue condizioni:
  // sono un punto di partenza, restano modificabili riga per riga.
  const [commission, setCommission] = useState(
    String((service?.commission_bps ?? 0) / 100).replace('.', ','),
  )

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Riga salvata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{service ? 'Modifica la riga' : 'Nuova riga di servizio'}</DialogTitle>
            <DialogDescription>
              Il costo è quello netto del fornitore, il prezzo è quello praticato al cliente. La
              differenza, più la commissione, è il margine.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            {service ? <input type="hidden" name="id" value={service.id ?? ''} /> : null}
            <input type="hidden" name="service_type" value={serviceType} />
            <input type="hidden" name="supplier_id" value={supplierId} />
            <input type="hidden" name="vat_regime" value={vatRegime} />
            <input type="hidden" name="sort_order" value={service?.sort_order ?? 0} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo di servizio" error={state.fieldErrors?.service_type}>
                {(props) => (
                  <Select
                    value={serviceType}
                    onValueChange={(value) => setServiceType(value as Enums['service_type'])}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue>{SERVICE_TYPE[serviceType]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SERVICE_TYPE).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Fornitore" error={state.fieldErrors?.supplier_id}>
                {(props) => (
                  <Select
                    value={supplierId}
                    onValueChange={(value) => {
                      setSupplierId(value)
                      const fornitore = suppliers.find((option) => option.id === value)
                      if (fornitore) {
                        setCommission(String(fornitore.commissionBps / 100).replace('.', ','))
                        setVatRegime(fornitore.vatRegime)
                      }
                    }}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue>
                        {supplierId === 'nessuno'
                          ? 'Nessun fornitore'
                          : suppliers.find((option) => option.id === supplierId)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nessuno">Nessun fornitore</SelectItem>
                      {suppliers.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="Descrizione" required className="sm:col-span-2" error={state.fieldErrors?.description}>
                {(props) => (
                  <Input
                    {...props}
                    name="description"
                    placeholder="Volo Milano–Malé andata e ritorno"
                    defaultValue={initial('description', service?.description)}
                  />
                )}
              </Field>

              <Field label="Dal" error={state.fieldErrors?.date_from}>
                {(props) => (
                  <Input
                    {...props}
                    name="date_from"
                    type="date"
                    defaultValue={initial('date_from', service?.date_from)}
                  />
                )}
              </Field>
              <Field label="Al" error={state.fieldErrors?.date_to}>
                {(props) => (
                  <Input
                    {...props}
                    name="date_to"
                    type="date"
                    defaultValue={initial('date_to', service?.date_to)}
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
                    defaultValue={initial('quantity', service?.quantity ?? 1)}
                  />
                )}
              </Field>

              <Field label="Codice di conferma" error={state.fieldErrors?.confirmation_code}>
                {(props) => (
                  <Input
                    {...props}
                    name="confirmation_code"
                    defaultValue={initial('confirmation_code', service?.confirmation_code)}
                  />
                )}
              </Field>

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
                    defaultValue={initial(
                      'unit_cost',
                      service ? centsToInputValue(service.unit_cost_cents ?? 0) : '',
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
                    defaultValue={initial(
                      'unit_price',
                      service ? centsToInputValue(service.unit_price_cents ?? 0) : '',
                    )}
                  />
                )}
              </Field>

              <Field
                label="Commissione (%)"
                hint="Provvigione riconosciuta dal fornitore."
                error={state.fieldErrors?.commission_percent}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="commission_percent"
                    inputMode="decimal"
                    value={commission}
                    onChange={(event) => setCommission(event.target.value)}
                  />
                )}
              </Field>

              <Field
                label="Commissione forzata"
                hint="Solo se il fornitore riconosce un importo fisso."
                error={state.fieldErrors?.commission_override}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="commission_override"
                    inputMode="decimal"
                    placeholder="—"
                    defaultValue={initial(
                      'commission_override',
                      service?.commission_override_cents != null
                        ? centsToInputValue(service.commission_override_cents)
                        : '',
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
                    defaultValue={initial(
                      'vat_percent',
                      String((service?.vat_bps ?? defaultVatBps) / 100).replace('.', ','),
                    )}
                  />
                )}
              </Field>

              <Field label="Regime IVA" hint={VAT_REGIME[vatRegime].note} error={state.fieldErrors?.vat_regime}>
                {(props) => (
                  <Select
                    value={vatRegime}
                    onValueChange={(value) => setVatRegime(value as Enums['vat_regime'])}
                  >
                    <SelectTrigger id={props.id}>
                      <SelectValue>{VAT_REGIME[vatRegime].label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(VAT_REGIME).map(([value, info]) => (
                        <SelectItem key={value} value={value}>
                          {info.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field
                label="Scadenza di pagamento al fornitore"
                error={state.fieldErrors?.supplier_due_date}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="supplier_due_date"
                    type="date"
                    defaultValue={initial('supplier_due_date', service?.supplier_due_date)}
                  />
                )}
              </Field>

              <Field label="Dettagli" className="sm:col-span-2" error={state.fieldErrors?.details}>
                {(props) => (
                  <Textarea
                    {...props}
                    name="details"
                    rows={2}
                    placeholder="Numero di volo, tipo di camera, trattamento."
                    defaultValue={initial('details', service?.details)}
                  />
                )}
              </Field>
            </div>

            {service ? (
              <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-caption text-text-muted">
                Su questa riga l’IVA è {formatEuro(service.vat_cents ?? 0)} su un imponibile di{' '}
                {formatEuro(service.taxable_cents ?? 0)} ({formatPercent(service.vat_bps ?? 0, 0)}
                {' '}
                {VAT_REGIME[service.vat_regime ?? 'ordinaria'].label.toLowerCase()}).
              </p>
            ) : null}

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Salvataggio...">
              {service ? 'Salva la riga' : 'Aggiungi la riga'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
