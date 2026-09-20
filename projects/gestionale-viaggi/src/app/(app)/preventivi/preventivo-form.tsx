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
import { saveQuoteAction } from '@/server/actions/preventivi'

const SALE_TYPE_NOTE: Record<'intermediazione' | 'organizzazione', string> = {
  intermediazione:
    'Rivendi il pacchetto di un tour operator: si fattura la commissione, l’IVA segue il regime ordinario.',
  organizzazione:
    'Il viaggio lo componi tu: si applica l’art. 74-ter e l’IVA si calcola sul margine.',
}

/** Fra un mese: è la validità che un preventivo ha quasi sempre. */
function fraUnMese(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
}

const CONDIZIONI_PREDEFINITE = [
  'Quotazione valida salvo disponibilità al momento della conferma.',
  'Acconto del 30% alla conferma, saldo 30 giorni prima della partenza.',
  'Condizioni di annullamento secondo le condizioni generali di contratto.',
].join(' ')

export function PreventivoForm({
  quote,
  customers,
  operators,
  defaultSaleType,
}: {
  quote?: Tables<'quotes'>
  customers: ReadonlyArray<{ id: string; label: string }>
  operators: ReadonlyArray<{ id: string; label: string }>
  defaultSaleType: 'intermediazione' | 'organizzazione'
}) {
  const [state, submit] = useActionState(saveQuoteAction, IDLE)
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

  const [dirty, setDirty] = useState(false)
  const [customerId, setCustomerId] = useState(quote?.customer_id ?? 'nessuno')
  const [ownerId, setOwnerId] = useState(quote?.owner_id ?? 'nessuno')
  const [saleType, setSaleType] = useState<'intermediazione' | 'organizzazione'>(
    quote?.sale_type ?? defaultSaleType,
  )

  const backHref = quote ? `/preventivi/${quote.id}` : '/preventivi'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {quote ? <input type="hidden" name="id" value={quote.id} /> : null}
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="owner_id" value={ownerId} />
      <input type="hidden" name="sale_type" value={saleType} />

      <Card>
        <CardHeader>
          <CardTitle>Il viaggio proposto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Cliente"
              hint="Si può lasciare vuoto: un preventivo può nascere prima del cliente."
              error={state.fieldErrors?.customer_id}
            >
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
                      {customerId === 'nessuno'
                        ? 'Non ancora indicato'
                        : customers.find((customer) => customer.id === customerId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Non ancora indicato</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Operatore che lo segue" error={state.fieldErrors?.owner_id}>
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
                        ? 'Non assegnato'
                        : operators.find((operator) => operator.id === ownerId)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Non assegnato</SelectItem>
                    {operators.map((operator) => (
                      <SelectItem key={operator.id} value={operator.id}>
                        {operator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Titolo"
              required
              hint="L’occasione del viaggio: Viaggio di nozze, Ponte lungo…"
              error={state.fieldErrors?.title}
            >
              {(props) => (
                <Input {...props} name="title" defaultValue={initial('title', quote?.title)} />
              )}
            </Field>

            <Field label="Destinazione" required error={state.fieldErrors?.destination}>
              {(props) => (
                <Input
                  {...props}
                  name="destination"
                  defaultValue={initial('destination', quote?.destination)}
                />
              )}
            </Field>

            <Field label="Partenza" error={state.fieldErrors?.departure_date}>
              {(props) => (
                <Input
                  {...props}
                  name="departure_date"
                  type="date"
                  defaultValue={initial('departure_date', quote?.departure_date)}
                />
              )}
            </Field>

            <Field label="Rientro" error={state.fieldErrors?.return_date}>
              {(props) => (
                <Input
                  {...props}
                  name="return_date"
                  type="date"
                  defaultValue={initial('return_date', quote?.return_date)}
                />
              )}
            </Field>

            <Field label="Passeggeri" required error={state.fieldErrors?.pax_count}>
              {(props) => (
                <Input
                  {...props}
                  name="pax_count"
                  type="number"
                  min={1}
                  max={500}
                  defaultValue={initial('pax_count', quote?.pax_count ?? 2)}
                />
              )}
            </Field>

            <Field
              label="Valido fino al"
              hint="Dopo questa data il collegamento non accetta più risposte."
              error={state.fieldErrors?.valid_until}
            >
              {(props) => (
                <Input
                  {...props}
                  name="valid_until"
                  type="date"
                  defaultValue={initial('valid_until', quote?.valid_until ?? fraUnMese())}
                />
              )}
            </Field>
          </div>

          <Field label="Tipo di vendita" hint={SALE_TYPE_NOTE[saleType]}>
            {() => (
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
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Che cosa legge il cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field
            label="Introduzione"
            hint="Le due righe in cima al preventivo, prima delle proposte."
            error={state.fieldErrors?.intro_text}
          >
            {(props) => (
              <Textarea
                {...props}
                name="intro_text"
                rows={3}
                placeholder="Gentile cliente, di seguito la proposta per…"
                defaultValue={initial('intro_text', quote?.intro_text)}
              />
            )}
          </Field>

          <Field
            label="Condizioni"
            hint="Validità, acconto, penali: compaiono in fondo al preventivo e nel PDF."
            error={state.fieldErrors?.terms_text}
          >
            {(props) => (
              <Textarea
                {...props}
                name="terms_text"
                rows={4}
                defaultValue={initial(
                  'terms_text',
                  quote?.terms_text ?? (quote ? '' : CONDIZIONI_PREDEFINITE),
                )}
              />
            )}
          </Field>

          <Field
            label="Note interne"
            hint="Non compaiono da nessuna parte per il cliente."
            error={state.fieldErrors?.notes}
          >
            {(props) => (
              <Textarea {...props} name="notes" rows={2} defaultValue={initial('notes', quote?.notes)} />
            )}
          </Field>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {quote ? 'Salva le modifiche' : 'Crea il preventivo'}
          </SubmitButton>
        </CardFooter>
      </Card>

      <FormMessage status={state.status} message={state.message} />
    </form>
  )
}
