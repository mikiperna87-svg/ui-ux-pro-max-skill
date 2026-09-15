'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { UnsavedChangesGuard } from '@/components/forms/unsaved-changes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { IDLE } from '@/lib/action-state'
import type { Tables } from '@/lib/database.types'
import { saveCustomerAction } from '@/server/actions/anagrafiche'

export function ClienteForm({ customer }: { customer?: Tables<'customers'> }) {
  const [state, submit] = useActionState(saveCustomerAction, IDLE)
  // Dopo una Server Action React azzera i campi non controllati: i valori
  // rimandati indietro dall’azione tornano a essere i default, cosi’ chi ha
  // sbagliato un carattere corregge quello invece di ridigitare il modulo.
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))
  const [kind, setKind] = useState<'privato' | 'azienda'>(customer?.kind ?? 'privato')
  const [dirty, setDirty] = useState(false)
  const [privacy, setPrivacy] = useState(Boolean(customer?.privacy_consent_at))
  const [marketing, setMarketing] = useState(customer?.marketing_consent ?? false)
  const [profiling, setProfiling] = useState(customer?.profiling_consent ?? false)

  const backHref = customer ? `/clienti/${customer.id}` : '/clienti'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="country" value={customer?.country ?? 'IT'} />

      <Card>
        <CardHeader>
          <CardTitle>Identificazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-small font-medium text-text">
              Tipo di cliente
            </p>
            <SegmentedControl
              label="Tipo di cliente"
              value={kind}
              options={[
                { value: 'privato', label: 'Privato' },
                { value: 'azienda', label: 'Azienda o ente' },
              ]}
              onChange={(value) => {
                setKind(value)
                setDirty(true)
              }}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {kind === 'privato' ? (
              <>
                <Field label="Cognome" required error={state.fieldErrors?.last_name}>
                  {(props) => (
                    <Input {...props} name="last_name" autoComplete="family-name" defaultValue={initial('last_name', customer?.last_name ?? '')} />
                  )}
                </Field>
                <Field label="Nome" error={state.fieldErrors?.first_name}>
                  {(props) => (
                    <Input {...props} name="first_name" autoComplete="given-name" defaultValue={initial('first_name', customer?.first_name ?? '')} />
                  )}
                </Field>
              </>
            ) : (
              <Field label="Ragione sociale" required className="sm:col-span-2" error={state.fieldErrors?.company_name}>
                {(props) => (
                  <Input {...props} name="company_name" autoComplete="organization" defaultValue={initial('company_name', customer?.company_name ?? '')} />
                )}
              </Field>
            )}

            <Field
              label="Partita IVA"
              hint="Undici cifre per l’Italia, oppure l’identificativo estero."
              error={state.fieldErrors?.vat_number}
            >
              {(props) => <Input {...props} name="vat_number" defaultValue={initial('vat_number', customer?.vat_number ?? '')} />}
            </Field>
            <Field label="Codice fiscale" error={state.fieldErrors?.tax_code}>
              {(props) => <Input {...props} name="tax_code" defaultValue={initial('tax_code', customer?.tax_code ?? '')} />}
            </Field>

            {kind === 'azienda' ? (
              <>
                <Field
                  label="Codice destinatario SDI"
                  hint="Sette caratteri per la fattura elettronica."
                  error={state.fieldErrors?.sdi_code}
                >
                  {(props) => (
                    <Input {...props} name="sdi_code" maxLength={7} defaultValue={initial('sdi_code', customer?.sdi_code ?? '')} />
                  )}
                </Field>
                <Field label="PEC" error={state.fieldErrors?.pec}>
                  {(props) => <Input {...props} name="pec" type="email" defaultValue={initial('pec', customer?.pec ?? '')} />}
                </Field>
              </>
            ) : (
              <>
                <Field label="Data di nascita" error={state.fieldErrors?.birth_date}>
                  {(props) => (
                    <Input {...props} name="birth_date" type="date" defaultValue={initial('birth_date', customer?.birth_date ?? '')} />
                  )}
                </Field>
                <Field label="Luogo di nascita" error={state.fieldErrors?.birth_place}>
                  {(props) => <Input {...props} name="birth_place" defaultValue={initial('birth_place', customer?.birth_place ?? '')} />}
                </Field>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contatti e residenza</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" error={state.fieldErrors?.email}>
              {(props) => <Input {...props} name="email" type="email" defaultValue={initial('email', customer?.email ?? '')} />}
            </Field>
            <Field label="Telefono" error={state.fieldErrors?.phone}>
              {(props) => <Input {...props} name="phone" type="tel" defaultValue={initial('phone', customer?.phone ?? '')} />}
            </Field>
            <Field label="Cellulare" error={state.fieldErrors?.mobile}>
              {(props) => <Input {...props} name="mobile" type="tel" defaultValue={initial('mobile', customer?.mobile ?? '')} />}
            </Field>
            <Field label="Canale preferito" hint="Come preferisce essere contattato." error={state.fieldErrors?.preferred_contact}>
              {(props) => (
                <Input {...props} name="preferred_contact" placeholder="Email, telefono, WhatsApp" defaultValue={initial('preferred_contact', customer?.preferred_contact ?? '')} />
              )}
            </Field>
            <Field label="Indirizzo" className="sm:col-span-2" error={state.fieldErrors?.address_line}>
              {(props) => <Input {...props} name="address_line" defaultValue={initial('address_line', customer?.address_line ?? '')} />}
            </Field>
            <Field label="CAP" error={state.fieldErrors?.postal_code}>
              {(props) => (
                <Input {...props} name="postal_code" inputMode="numeric" maxLength={5} defaultValue={initial('postal_code', customer?.postal_code ?? '')} />
              )}
            </Field>
            <Field label="Città" error={state.fieldErrors?.city}>
              {(props) => <Input {...props} name="city" defaultValue={initial('city', customer?.city ?? '')} />}
            </Field>
            <Field label="Provincia" error={state.fieldErrors?.province}>
              {(props) => <Input {...props} name="province" maxLength={2} defaultValue={initial('province', customer?.province ?? '')} />}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consensi e note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Tag" hint="Separati da virgola: vip, famiglia, gruppo scuola." error={state.fieldErrors?.tags}>
            {(props) => (
              <Input {...props} name="tags" defaultValue={initial('tags', (customer?.tags ?? []).join(', '))} />
            )}
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-small font-medium text-text">Consensi</legend>
            <p className="text-caption text-text-muted">
              La data in cui il consenso è stato raccolto viene registrata automaticamente.
            </p>
            {(
              [
                {
                  name: 'privacy_consent',
                  label: 'Informativa privacy consegnata e accettata',
                  checked: privacy,
                  set: setPrivacy,
                },
                {
                  name: 'marketing_consent',
                  label: 'Consenso all’invio di comunicazioni commerciali',
                  checked: marketing,
                  set: setMarketing,
                },
                {
                  name: 'profiling_consent',
                  label: 'Consenso alla profilazione per offerte personalizzate',
                  checked: profiling,
                  set: setProfiling,
                },
              ] as const
            ).map((consent) => (
              <label key={consent.name} className="flex items-start gap-2.5 text-small text-text">
                <Checkbox
                  name={consent.name}
                  checked={consent.checked}
                  onCheckedChange={(value) => {
                    consent.set(value === true)
                    setDirty(true)
                  }}
                  className="mt-0.5"
                />
                {consent.label}
              </label>
            ))}
          </fieldset>

          <Field label="Note" error={state.fieldErrors?.notes}>
            {(props) => (
              <Textarea {...props} name="notes" rows={4} placeholder="Preferenze, abitudini, richieste ricorrenti." defaultValue={initial('notes', customer?.notes ?? '')} />
            )}
          </Field>

          <FormMessage status={state.status} message={state.message} />
        </CardContent>
        <CardFooter>
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {customer ? 'Salva le modifiche' : 'Crea il cliente'}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
