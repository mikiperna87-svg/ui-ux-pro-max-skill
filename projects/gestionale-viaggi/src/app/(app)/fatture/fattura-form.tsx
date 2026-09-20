'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { UnsavedChangesGuard } from '@/components/forms/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IDLE } from '@/lib/action-state'
import type { Enums, Tables } from '@/lib/database.types'
import { VAT_REGIME } from '@/lib/labels'
import { saveInvoiceAction } from '@/server/actions/fatture'
import { toDateInput } from '@/lib/date'

const REGIMI: readonly Enums['vat_regime'][] = [
  'art_74_ter',
  'ordinaria',
  'esente_art_10',
  'fuori_campo',
  'reverse_charge',
]

const CONDIZIONI_PREDEFINITE = 'Bonifico bancario a 30 giorni data fattura.'

const oggi = () => new Date().toISOString().slice(0, 10)

/** Fra trenta giorni: la scadenza abituale di una fattura di agenzia. */
function fraTrentaGiorni(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
}

export function FatturaForm({
  invoice,
  customers,
  bookings,
  defaultVatRegime,
}: {
  invoice?: Tables<'invoices'>
  customers: ReadonlyArray<{ id: string; label: string }>
  bookings: ReadonlyArray<{ id: string; label: string }>
  defaultVatRegime: Enums['vat_regime']
}) {
  const [state, submit] = useActionState(saveInvoiceAction, IDLE)
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  const [dirty, setDirty] = useState(false)
  const [customerId, setCustomerId] = useState(invoice?.customer_id ?? '')
  const [bookingId, setBookingId] = useState(invoice?.booking_id ?? 'nessuna')
  const [regime, setRegime] = useState<Enums['vat_regime']>(
    invoice?.vat_regime ?? defaultVatRegime,
  )

  const backHref = invoice ? `/fatture/${invoice.id}` : '/fatture'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {invoice ? <input type="hidden" name="id" value={invoice.id} /> : null}
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="vat_regime" value={regime} />

      <Card>
        <CardHeader>
          <CardTitle>Intestazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente" required error={state.fieldErrors?.customer_id}>
              {(props) => (
                <Select
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue>
                      {customerId === ''
                        ? 'Scegli il cliente'
                        : customers.find((customer) => customer.id === customerId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Pratica"
              hint="Collegarla permette di ritrovare gli incassi e il margine del viaggio."
              error={state.fieldErrors?.booking_id}
            >
              {(props) => (
                <Select
                  value={bookingId}
                  onValueChange={(value) => {
                    setBookingId(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue>
                      {bookingId === 'nessuna'
                        ? 'Nessuna pratica'
                        : bookings.find((booking) => booking.id === bookingId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuna">Nessuna pratica</SelectItem>
                    {bookings.map((booking) => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {booking.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Data di emissione"
              required
              hint="Il numero definitivo si assegna quando emetti il documento."
              error={state.fieldErrors?.issue_date}
            >
              {(props) => (
                <Input
                  {...props}
                  name="issue_date"
                  type="date"
                  max={oggi()}
                  defaultValue={initial('issue_date', toDateInput(invoice?.issue_date) || oggi())}
                />
              )}
            </Field>

            <Field label="Scadenza del pagamento" error={state.fieldErrors?.due_date}>
              {(props) => (
                <Input
                  {...props}
                  name="due_date"
                  type="date"
                  defaultValue={initial('due_date', toDateInput(invoice?.due_date) || fraTrentaGiorni())}
                />
              )}
            </Field>
          </div>

          <Field
            label="Regime IVA"
            hint={VAT_REGIME[regime].note}
            error={state.fieldErrors?.vat_regime}
          >
            {(props) => (
              <Select
                value={regime}
                onValueChange={(value) => {
                  setRegime(value as Enums['vat_regime'])
                  setDirty(true)
                }}
              >
                <SelectTrigger id={props.id}>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Che cosa legge il cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Condizioni di pagamento" error={state.fieldErrors?.payment_terms}>
            {(props) => (
              <Input
                {...props}
                name="payment_terms"
                defaultValue={initial(
                  'payment_terms',
                  invoice?.payment_terms ?? (invoice ? '' : CONDIZIONI_PREDEFINITE),
                )}
              />
            )}
          </Field>

          <Field
            label="Note"
            hint="Compaiono sul documento, sotto le righe."
            error={state.fieldErrors?.notes}
          >
            {(props) => (
              <Textarea {...props} name="notes" rows={2} defaultValue={initial('notes', invoice?.notes)} />
            )}
          </Field>

          <Field
            label="Dicitura di legge"
            hint="Il riferimento normativo stampato in calce: per l’art. 74-ter è obbligatorio."
            error={state.fieldErrors?.legal_notes}
          >
            {(props) => (
              <Textarea
                {...props}
                name="legal_notes"
                rows={3}
                defaultValue={initial('legal_notes', invoice?.legal_notes)}
              />
            )}
          </Field>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {invoice ? 'Salva le modifiche' : 'Crea la bozza'}
          </SubmitButton>
        </CardFooter>
      </Card>

      <FormMessage status={state.status} message={state.message} />
    </form>
  )
}
