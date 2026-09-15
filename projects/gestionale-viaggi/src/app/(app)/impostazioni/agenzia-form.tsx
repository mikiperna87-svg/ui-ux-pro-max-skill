'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/lib/database.types'
import { IDLE } from '@/lib/action-state'
import { updateAgencyAction } from '@/server/actions/settings'

export function AgenziaForm({ agency }: { agency: Tables<'agencies'> }) {
  const [state, submit] = useActionState(updateAgencyAction, IDLE)

  return (
    <form action={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Dati dell’agenzia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Identificazione</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome commerciale" required error={state.fieldErrors?.name}>
                {(props) => <Input {...props} name="name" defaultValue={agency.name} required />}
              </Field>
              <Field label="Ragione sociale" error={state.fieldErrors?.legal_name}>
                {(props) => <Input {...props} name="legal_name" defaultValue={agency.legal_name ?? ''} />}
              </Field>
              <Field label="Partita IVA" error={state.fieldErrors?.vat_number}>
                {(props) => (
                  <Input {...props} name="vat_number" inputMode="numeric" defaultValue={agency.vat_number ?? ''} />
                )}
              </Field>
              <Field label="Codice fiscale" error={state.fieldErrors?.tax_code}>
                {(props) => <Input {...props} name="tax_code" defaultValue={agency.tax_code ?? ''} />}
              </Field>
              <Field label="Numero REA" error={state.fieldErrors?.rea_number}>
                {(props) => <Input {...props} name="rea_number" defaultValue={agency.rea_number ?? ''} />}
              </Field>
              <Field
                label="Autorizzazione all’esercizio"
                hint="Numero della licenza rilasciata dalla Regione o dal Comune."
                error={state.fieldErrors?.license_number}
              >
                {(props) => <Input {...props} name="license_number" defaultValue={agency.license_number ?? ''} />}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Sede</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Indirizzo" className="sm:col-span-2" error={state.fieldErrors?.address_line}>
                {(props) => <Input {...props} name="address_line" defaultValue={agency.address_line ?? ''} />}
              </Field>
              <Field label="CAP" error={state.fieldErrors?.postal_code}>
                {(props) => (
                  <Input {...props} name="postal_code" inputMode="numeric" defaultValue={agency.postal_code ?? ''} />
                )}
              </Field>
              <Field label="Città" error={state.fieldErrors?.city}>
                {(props) => <Input {...props} name="city" defaultValue={agency.city ?? ''} />}
              </Field>
              <Field label="Provincia" hint="Sigla di due lettere." error={state.fieldErrors?.province}>
                {(props) => (
                  <Input {...props} name="province" maxLength={2} defaultValue={agency.province ?? ''} />
                )}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Contatti e pagamenti</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={state.fieldErrors?.email}>
                {(props) => <Input {...props} name="email" type="email" defaultValue={agency.email ?? ''} />}
              </Field>
              <Field label="PEC" error={state.fieldErrors?.pec}>
                {(props) => <Input {...props} name="pec" type="email" defaultValue={agency.pec ?? ''} />}
              </Field>
              <Field label="Telefono" error={state.fieldErrors?.phone}>
                {(props) => <Input {...props} name="phone" type="tel" defaultValue={agency.phone ?? ''} />}
              </Field>
              <Field label="Sito web" error={state.fieldErrors?.website}>
                {(props) => <Input {...props} name="website" type="url" defaultValue={agency.website ?? ''} />}
              </Field>
              <Field
                label="IBAN"
                className="sm:col-span-2"
                hint="Compare sulle fatture come coordinate per il bonifico."
                error={state.fieldErrors?.iban}
              >
                {(props) => <Input {...props} name="iban" defaultValue={agency.iban ?? ''} />}
              </Field>
              <Field
                label="Polizza assicurativa"
                className="sm:col-span-2"
                hint="Estremi della polizza obbligatoria a garanzia dei viaggiatori."
                error={state.fieldErrors?.insurance_policy}
              >
                {(props) => <Input {...props} name="insurance_policy" defaultValue={agency.insurance_policy ?? ''} />}
              </Field>
            </div>
          </fieldset>

          <FormMessage status={state.status} message={state.message} />
        </CardContent>
        <CardFooter>
          <SubmitButton pendingLabel="Salvataggio...">Salva i dati</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
