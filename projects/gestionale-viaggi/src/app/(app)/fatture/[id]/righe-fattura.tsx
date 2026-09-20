'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
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
  TableCellNumeric,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { IDLE, type ActionState } from '@/lib/action-state'
import type { Enums } from '@/lib/database.types'
import { VAT_REGIME } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { deleteInvoiceItemAction, saveInvoiceItemAction } from '@/server/actions/fatture'
import type { InvoiceItemRow } from '@/server/queries/fatture'

const REGIMI: readonly Enums['vat_regime'][] = [
  'art_74_ter',
  'ordinaria',
  'esente_art_10',
  'fuori_campo',
  'reverse_charge',
]

function valoreIniziale(state: ActionState, campo: string, ripiego = ''): string {
  return state.values?.[campo] ?? ripiego
}

/** Importo in centesimi scritto come lo scriverebbe una persona: "1.234,56". */
function euroEditabile(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',')
}

export function RigheFattura({
  invoiceId,
  items,
  totals,
  isDraft,
  canWrite,
  defaultVatRegime,
  defaultVatBps,
}: {
  invoiceId: string
  items: readonly InvoiceItemRow[]
  totals: { taxable: number; vat: number; total: number; margin: number }
  isDraft: boolean
  canWrite: boolean
  defaultVatRegime: Enums['vat_regime']
  defaultVatBps: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [rigaAperta, setRigaAperta] = useState<InvoiceItemRow | null>(null)
  const [nuova, setNuova] = useState(false)

  const modificabile = isDraft && canWrite
  // Il 74-ter compare in almeno una riga: allora la colonna del costo, da cui
  // esce il margine, deve stare in tabella e non in un dettaglio nascosto.
  const conMargine = items.some((riga) => riga.vat_regime === 'art_74_ter')

  function elimina(id: string) {
    startTransition(async () => {
      const esito = await deleteInvoiceItemAction(id, invoiceId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Riga rimossa.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a togliere la riga.')
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle>Righe del documento</CardTitle>
            {modificabile ? (
              <Button variant="primary" size="sm" onClick={() => setNuova(true)}>
                <Plus aria-hidden="true" />
                Aggiungi una riga
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Il documento è vuoto"
                description="Aggiungi almeno una riga: senza righe non si può emettere."
                action={
                  modificabile ? (
                    <Button variant="primary" onClick={() => setNuova(true)}>
                      Aggiungi la prima riga
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <TableWrapper className="hidden rounded-none border-0 shadow-none md:block">
                <Table>
                  <caption className="sr-only">Righe del documento</caption>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Descrizione</TableHeaderCell>
                      <TableHeaderCell className="text-right">Q.tà</TableHeaderCell>
                      <TableHeaderCell className="text-right">Importo</TableHeaderCell>
                      {conMargine ? (
                        <TableHeaderCell className="text-right">Costo del viaggio</TableHeaderCell>
                      ) : null}
                      <TableHeaderCell className="text-right">Imponibile</TableHeaderCell>
                      <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                      {modificabile ? (
                        <TableHeaderCell className="w-24 text-right">Azioni</TableHeaderCell>
                      ) : null}
                    </tr>
                  </TableHead>
                  <TableBody>
                    {items.map((riga) => (
                      <TableRow key={riga.id}>
                        <TableCell>
                          <p className="font-medium text-text">{riga.description}</p>
                          <p className="text-caption text-text-muted">
                            {riga.vat_regime ? VAT_REGIME[riga.vat_regime].label : ''}
                            {riga.vat_bps ? ` · ${formatPercent(riga.vat_bps)}` : ''}
                          </p>
                        </TableCell>
                        <TableCellNumeric>{riga.quantity}</TableCellNumeric>
                        <TableCellNumeric>{formatEuro(riga.gross_cents ?? 0)}</TableCellNumeric>
                        {conMargine ? (
                          <TableCellNumeric className="text-text-muted">
                            {formatEuro(riga.cost_cents ?? 0)}
                          </TableCellNumeric>
                        ) : null}
                        <TableCellNumeric>{formatEuro(riga.taxable_cents ?? 0)}</TableCellNumeric>
                        <TableCellNumeric>{formatEuro(riga.vat_cents ?? 0)}</TableCellNumeric>
                        {modificabile ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Modifica ${riga.description}`}
                                onClick={() => setRigaAperta(riga)}
                              >
                                <Pencil aria-hidden="true" />
                              </Button>
                              <ConfirmDialog
                                trigger={
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Elimina ${riga.description}`}
                                  >
                                    <Trash2 aria-hidden="true" />
                                  </Button>
                                }
                                title="Togliere questa riga?"
                                description={riga.description ?? ''}
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

              {/* Su telefono la tabella a sette colonne non si legge: schede. */}
              <ul className="divide-y divide-border md:hidden">
                {items.map((riga) => (
                  <li key={riga.id} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium text-text">{riga.description}</p>
                      <p className="num shrink-0 font-medium text-text">
                        {formatEuro(riga.gross_cents ?? 0)}
                      </p>
                    </div>
                    <p className="num text-caption text-text-muted">
                      imponibile {formatEuro(riga.taxable_cents ?? 0)} · IVA{' '}
                      {formatEuro(riga.vat_cents ?? 0)}
                      {riga.vat_regime === 'art_74_ter'
                        ? ` · costo ${formatEuro(riga.cost_cents ?? 0)}`
                        : ''}
                    </p>
                    {modificabile ? (
                      <div className="flex gap-2 pt-1">
                        <Button variant="secondary" size="sm" onClick={() => setRigaAperta(riga)}>
                          <Pencil aria-hidden="true" />
                          Modifica
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="sm">
                              <Trash2 aria-hidden="true" />
                              Togli
                            </Button>
                          }
                          title="Togliere questa riga?"
                          description={riga.description ?? ''}
                          confirmLabel="Togli"
                          onConfirm={() => elimina(riga.id ?? '')}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              <Riepilogo totals={totals} conMargine={conMargine} />
            </>
          )}
        </CardContent>
      </Card>

      {/*
        I dialoghi stanno qui, non dentro la riga: l'azione fa sparire la riga e
        con essa l'effetto che dovrebbe chiudere il dialogo (DECISIONI 40).
      */}
      <DialogoRiga
        invoiceId={invoiceId}
        riga={rigaAperta}
        open={rigaAperta !== null || nuova}
        defaultVatRegime={defaultVatRegime}
        defaultVatBps={defaultVatBps}
        prossimoOrdine={items.length}
        onOpenChange={(valore) => {
          if (!valore) {
            setRigaAperta(null)
            setNuova(false)
          }
        }}
      />
    </>
  )
}

/**
 * Il quadro dell'IVA, scritto per esteso.
 *
 * Nel regime 74-ter l'imponibile non è il corrispettivo ma il margine, e
 * l'imposta si scorpora da lì: se il conto non è visibile, chi fattura non può
 * accorgersi di un costo sbagliato.
 */
function Riepilogo({
  totals,
  conMargine,
}: {
  totals: { taxable: number; vat: number; total: number; margin: number }
  conMargine: boolean
}) {
  return (
    <div className="border-t border-border bg-surface-2 p-4">
      <dl className="ml-auto max-w-sm space-y-1.5 text-small">
        {conMargine ? (
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Margine (corrispettivi − costi del viaggio)</dt>
            <dd className="num text-text">{formatEuro(totals.margin)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">Imponibile</dt>
          <dd className="num text-text">{formatEuro(totals.taxable)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">IVA</dt>
          <dd className="num text-text">{formatEuro(totals.vat)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-1.5">
          <dt className="font-medium text-text">Totale documento</dt>
          <dd className="num text-heading font-semibold text-text">{formatEuro(totals.total)}</dd>
        </div>
      </dl>
    </div>
  )
}

function DialogoRiga({
  invoiceId,
  riga,
  open,
  defaultVatRegime,
  defaultVatBps,
  prossimoOrdine,
  onOpenChange,
}: {
  invoiceId: string
  riga: InvoiceItemRow | null
  open: boolean
  defaultVatRegime: Enums['vat_regime']
  defaultVatBps: number
  prossimoOrdine: number
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(saveInvoiceItemAction, IDLE)
  const [regime, setRegime] = useState<Enums['vat_regime']>(riga?.vat_regime ?? defaultVatRegime)

  useEffect(() => {
    setRegime(riga?.vat_regime ?? defaultVatRegime)
  }, [riga, defaultVatRegime])

  useEffect(() => {
    if (state.status === 'success') {
      onOpenChange(false)
      toast.success(state.message ?? 'Riga salvata.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form action={submit}>
          <DialogHeader>
            <DialogTitle>{riga ? 'Modifica la riga' : 'Nuova riga'}</DialogTitle>
            <DialogDescription>
              L’importo è quello che paga il cliente, IVA compresa. Il costo del viaggio serve al
              regime 74-ter, dove l’imposta si calcola sul margine.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <input type="hidden" name="invoice_id" value={invoiceId} />
            {riga ? <input type="hidden" name="id" value={riga.id ?? ''} /> : null}
            <input type="hidden" name="vat_regime" value={regime} />
            <input
              type="hidden"
              name="sort_order"
              value={String(riga?.sort_order ?? prossimoOrdine)}
            />

            <Field label="Descrizione" required error={state.fieldErrors?.description}>
              {(props) => (
                <Input
                  {...props}
                  name="description"
                  placeholder="Pacchetto turistico Lisbona, 7 notti"
                  defaultValue={valoreIniziale(state, 'description', riga?.description ?? '')}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
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

              <Field label="Importo unitario" required error={state.fieldErrors?.unit_price}>
                {(props) => (
                  <Input
                    {...props}
                    name="unit_price"
                    inputMode="decimal"
                    defaultValue={valoreIniziale(
                      state,
                      'unit_price',
                      euroEditabile(riga?.unit_price_cents),
                    )}
                  />
                )}
              </Field>

              <Field
                label="Costo del viaggio"
                hint={regime === 'art_74_ter' ? 'Da qui esce il margine.' : 'Non incide: regime diverso dal 74-ter.'}
                error={state.fieldErrors?.cost}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="cost"
                    inputMode="decimal"
                    defaultValue={valoreIniziale(state, 'cost', euroEditabile(riga?.cost_cents))}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Regime IVA" hint={VAT_REGIME[regime].note}>
                {(props) => (
                  <Select
                    value={regime}
                    onValueChange={(valore) => setRegime(valore as Enums['vat_regime'])}
                  >
                    <SelectTrigger {...props}>
                      <SelectValue>{VAT_REGIME[regime].label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {REGIMI.map((valore) => (
                        <SelectItem key={valore} value={valore}>
                          {VAT_REGIME[valore].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            </div>

            <FormMessage status={state.status} message={state.message} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <SubmitButton pendingLabel="Salvataggio...">
              {riga ? 'Salva' : 'Aggiungi la riga'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
