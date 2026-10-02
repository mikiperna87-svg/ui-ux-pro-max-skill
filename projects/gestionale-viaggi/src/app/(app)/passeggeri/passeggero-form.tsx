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
import type { Tables } from '@/lib/database.types'
import { savePassengerAction } from '@/server/actions/anagrafiche'
import { toDateInput } from '@/lib/date'

const DOCUMENT_TYPES = [
  { value: 'nessuno', label: 'Nessun documento' },
  { value: 'passaporto', label: 'Passaporto' },
  { value: 'carta_identita', label: 'Carta d’identità' },
  { value: 'patente', label: 'Patente' },
  { value: 'permesso_soggiorno', label: 'Permesso di soggiorno' },
]

export function PasseggeroForm({
  passenger,
  customers,
  defaultCustomerId,
}: {
  passenger?: Tables<'passengers'>
  customers: ReadonlyArray<{ id: string; label: string }>
  defaultCustomerId?: string
}) {
  const [state, submit] = useActionState(savePassengerAction, IDLE)
  // Dopo una Server Action React azzera i campi non controllati: i valori
  // rimandati indietro dall’azione tornano a essere i default, cosi’ chi ha
  // sbagliato un carattere corregge quello invece di ridigitare il modulo.
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))
  const [dirty, setDirty] = useState(false)
  const [customerId, setCustomerId] = useState(
    passenger?.customer_id ?? defaultCustomerId ?? 'nessuno',
  )
  const [documentType, setDocumentType] = useState(passenger?.document_type ?? 'nessuno')
  const [gender, setGender] = useState(passenger?.gender ?? 'non_indicato')

  const backHref = passenger ? `/passeggeri/${passenger.id}` : '/passeggeri'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {passenger ? <input type="hidden" name="id" value={passenger.id} /> : null}
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="document_type" value={documentType} />
      <input type="hidden" name="gender" value={gender} />

      <Card>
        <CardHeader>
          <CardTitle>Dati del passeggero</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cognome" required error={state.fieldErrors?.last_name}>
              {(props) => (
                <Input {...props} name="last_name" autoComplete="family-name" defaultValue={initial('last_name', passenger?.last_name ?? '')} required />
              )}
            </Field>
            <Field label="Nome" required error={state.fieldErrors?.first_name}>
              {(props) => (
                <Input {...props} name="first_name" autoComplete="given-name" defaultValue={initial('first_name', passenger?.first_name ?? '')} required />
              )}
            </Field>

            <Field
              label="Cliente collegato"
              hint="Chi intesta le pratiche di questo passeggero."
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
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nessuno">Nessun cliente</SelectItem>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Nazionalità" error={state.fieldErrors?.nationality}>
              {(props) => (
                <Input {...props} name="nationality" maxLength={2} defaultValue={initial('nationality', passenger?.nationality ?? 'IT')} />
              )}
            </Field>

            <Field label="Data di nascita" error={state.fieldErrors?.birth_date}>
              {(props) => (
                <Input {...props} name="birth_date" type="date" defaultValue={initial('birth_date', toDateInput(passenger?.birth_date))} />
              )}
            </Field>
            <Field label="Luogo di nascita" error={state.fieldErrors?.birth_place}>
              {(props) => <Input {...props} name="birth_place" defaultValue={initial('birth_place', passenger?.birth_place ?? '')} />}
            </Field>

            <Field label="Sesso" error={state.fieldErrors?.gender}>
              {(props) => (
                <Select
                  value={gender}
                  onValueChange={(value) => {
                    setGender(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non_indicato">Non indicato</SelectItem>
                    <SelectItem value="F">Femminile</SelectItem>
                    <SelectItem value="M">Maschile</SelectItem>
                    <SelectItem value="X">Altro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Codice fiscale" error={state.fieldErrors?.tax_code}>
              {(props) => <Input {...props} name="tax_code" defaultValue={initial('tax_code', passenger?.tax_code ?? '')} />}
            </Field>

            <Field label="Email" error={state.fieldErrors?.email}>
              {(props) => <Input {...props} name="email" type="email" defaultValue={initial('email', passenger?.email ?? '')} />}
            </Field>
            <Field label="Telefono" error={state.fieldErrors?.phone}>
              {(props) => <Input {...props} name="phone" type="tel" defaultValue={initial('phone', passenger?.phone ?? '')} />}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>Documento di viaggio</CardTitle>
            <p className="text-small text-text-muted">
              Il documento deve restare valido fino al rientro: il gestionale avvisa quando non lo è.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" error={state.fieldErrors?.document_type}>
              {(props) => (
                <Select
                  value={documentType}
                  onValueChange={(value) => {
                    setDocumentType(value as typeof documentType)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Numero" error={state.fieldErrors?.document_number}>
              {(props) => (
                <Input {...props} name="document_number" defaultValue={initial('document_number', passenger?.document_number ?? '')} />
              )}
            </Field>
            <Field label="Rilasciato il" error={state.fieldErrors?.document_issued_at}>
              {(props) => (
                <Input {...props} name="document_issued_at" type="date" defaultValue={initial('document_issued_at', toDateInput(passenger?.document_issued_at))} />
              )}
            </Field>
            <Field label="Scade il" error={state.fieldErrors?.document_expires_at}>
              {(props) => (
                <Input {...props} name="document_expires_at" type="date" defaultValue={initial('document_expires_at', toDateInput(passenger?.document_expires_at))} />
              )}
            </Field>
            <Field label="Rilasciato da" className="sm:col-span-2" error={state.fieldErrors?.document_issuer}>
              {(props) => (
                <Input {...props} name="document_issuer" placeholder="Comune di Varese, Questura di Milano" defaultValue={initial('document_issuer', passenger?.document_issuer ?? '')} />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Esigenze e note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Esigenze alimentari"
              hint="Allergie e intolleranze: vanno comunicate al fornitore."
              error={state.fieldErrors?.dietary_needs}
            >
              {(props) => (
                <Input {...props} name="dietary_needs" defaultValue={initial('dietary_needs', passenger?.dietary_needs ?? '')} />
              )}
            </Field>
            <Field label="Esigenze particolari" error={state.fieldErrors?.special_needs}>
              {(props) => (
                <Input {...props} name="special_needs" placeholder="Mobilità ridotta, assistenza in aeroporto" defaultValue={initial('special_needs', passenger?.special_needs ?? '')} />
              )}
            </Field>
            <Field label="Programma fedeltà" error={state.fieldErrors?.frequent_flyer}>
              {(props) => (
                <Input {...props} name="frequent_flyer" defaultValue={initial('frequent_flyer', passenger?.frequent_flyer ?? '')} />
              )}
            </Field>
          </div>
          <Field label="Note" error={state.fieldErrors?.notes}>
            {(props) => <Textarea {...props} name="notes" rows={3} defaultValue={initial('notes', passenger?.notes ?? '')} />}
          </Field>
          <FormMessage status={state.status} message={state.message} />
        </CardContent>
        <CardFooter>
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {passenger ? 'Salva le modifiche' : 'Crea il passeggero'}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
