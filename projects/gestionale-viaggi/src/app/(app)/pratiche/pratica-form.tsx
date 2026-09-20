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
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IDLE } from '@/lib/action-state'
import type { Tables } from '@/lib/database.types'
import { saveBookingAction } from '@/server/actions/pratiche'
import { toDateInput } from '@/lib/date'

const SALE_TYPE_NOTE: Record<'intermediazione' | 'organizzazione', string> = {
  intermediazione:
    'Rivendi il pacchetto di un tour operator: si fattura la commissione, l’IVA segue il regime ordinario.',
  organizzazione:
    'Il viaggio lo componi tu: si applica l’art. 74-ter e l’IVA si calcola sul margine, non sul corrispettivo.',
}

export function PraticaForm({
  booking,
  customers,
  operators,
  defaultCustomerId,
  defaultSaleType,
}: {
  booking?: Tables<'bookings'>
  customers: ReadonlyArray<{ id: string; label: string }>
  operators: ReadonlyArray<{ id: string; label: string }>
  defaultCustomerId?: string
  defaultSaleType: 'intermediazione' | 'organizzazione'
}) {
  const [state, submit] = useActionState(saveBookingAction, IDLE)
  // Dopo una Server Action React azzera i campi non controllati: i valori
  // rimandati indietro dall’azione tornano a essere i default.
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  const [dirty, setDirty] = useState(false)
  const [customerId, setCustomerId] = useState(booking?.customer_id ?? defaultCustomerId ?? '')
  const [ownerId, setOwnerId] = useState(booking?.owner_id ?? 'nessuno')
  const [saleType, setSaleType] = useState<'intermediazione' | 'organizzazione'>(
    booking?.sale_type ?? defaultSaleType,
  )

  const backHref = booking ? `/pratiche/${booking.id}` : '/pratiche'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {booking ? <input type="hidden" name="id" value={booking.id} /> : null}
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="owner_id" value={ownerId} />
      <input type="hidden" name="sale_type" value={saleType} />

      <Card>
        <CardHeader>
          <CardTitle>Il viaggio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente intestatario" required error={state.fieldErrors?.customer_id}>
              {(props) => (
                <Select
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue placeholder="Scegli il cliente">
                      {customers.find((customer) => customer.id === customerId)?.label}
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
              label="Operatore che la segue"
              hint="Chi è responsabile della pratica."
              error={state.fieldErrors?.owner_id}
            >
              {(props) => (
                <Select
                  value={ownerId}
                  onValueChange={(value) => {
                    setOwnerId(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue>
                      {ownerId === 'nessuno'
                        ? 'Non assegnata'
                        : operators.find((operator) => operator.id === ownerId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Non assegnata</SelectItem>
                    {operators.map((operator) => (
                      <SelectItem key={operator.id} value={operator.id}>
                        {operator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Titolo della pratica" required className="sm:col-span-2" error={state.fieldErrors?.title}>
              {(props) => (
                <Input
                  {...props}
                  name="title"
                  placeholder="Viaggio di nozze alle Maldive"
                  defaultValue={initial('title', booking?.title)}
                />
              )}
            </Field>

            <Field label="Destinazione" required error={state.fieldErrors?.destination}>
              {(props) => (
                <Input
                  {...props}
                  name="destination"
                  placeholder="Malé e atollo di Baa"
                  defaultValue={initial('destination', booking?.destination)}
                />
              )}
            </Field>

            <Field label="Paese" error={state.fieldErrors?.country}>
              {(props) => (
                <Input {...props} name="country" defaultValue={initial('country', booking?.country)} />
              )}
            </Field>

            <Field label="Partenza" error={state.fieldErrors?.departure_date}>
              {(props) => (
                <Input
                  {...props}
                  name="departure_date"
                  type="date"
                  defaultValue={initial('departure_date', toDateInput(booking?.departure_date))}
                />
              )}
            </Field>

            <Field label="Rientro" error={state.fieldErrors?.return_date}>
              {(props) => (
                <Input
                  {...props}
                  name="return_date"
                  type="date"
                  defaultValue={initial('return_date', toDateInput(booking?.return_date))}
                />
              )}
            </Field>

            <Field label="Numero di passeggeri" error={state.fieldErrors?.pax_count}>
              {(props) => (
                <Input
                  {...props}
                  name="pax_count"
                  type="number"
                  min={0}
                  max={500}
                  defaultValue={initial('pax_count', booking?.pax_count ?? 1)}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>Regime di vendita</CardTitle>
            <p className="text-small text-text-muted">{SALE_TYPE_NOTE[saleType]}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SegmentedControl
            label="Tipo di vendita"
            value={saleType}
            options={[
              { value: 'intermediazione', label: 'Intermediazione' },
              { value: 'organizzazione', label: 'Organizzazione' },
            ]}
            onChange={(value) => {
              setSaleType(value)
              setDirty(true)
            }}
          />

          <Field
            label="Note per il cliente"
            hint="Compaiono sui documenti che il cliente riceve."
            error={state.fieldErrors?.notes}
          >
            {(props) => (
              <Textarea {...props} name="notes" rows={3} defaultValue={initial('notes', booking?.notes)} />
            )}
          </Field>

          <Field
            label="Note interne"
            hint="Restano in agenzia: accordi, avvertenze, cose da ricordare."
            error={state.fieldErrors?.internal_notes}
          >
            {(props) => (
              <Textarea
                {...props}
                name="internal_notes"
                rows={3}
                defaultValue={initial('internal_notes', booking?.internal_notes)}
              />
            )}
          </Field>

          <FormMessage status={state.status} message={state.message} />
        </CardContent>
        <CardFooter>
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {booking ? 'Salva le modifiche' : 'Apri la pratica'}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
