'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SelectCodice } from '@/components/forms/select-codice'
import { SubmitButton } from '@/components/forms/submit-button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Tables } from '@/lib/database.types'
import { IDLE } from '@/lib/action-state'
import { REGIMI_FISCALI } from '@/lib/sdi/codici'
import { updateAgencyAction } from '@/server/actions/settings'

export function AgenziaForm({ agency }: { agency: Tables<'agencies'> }) {
  const [state, submit] = useActionState(updateAgencyAction, IDLE)
  // I valori rimandati dall’azione tornano a essere i default: dopo un errore
  // di validazione il modulo resta compilato com’era.
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))

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
                {(props) => <Input {...props} name="name" defaultValue={initial('name', agency.name)} required />}
              </Field>
              <Field label="Ragione sociale" error={state.fieldErrors?.legal_name}>
                {(props) => <Input {...props} name="legal_name" defaultValue={initial('legal_name', agency.legal_name ?? '')} />}
              </Field>
              <Field label="Partita IVA" error={state.fieldErrors?.vat_number}>
                {(props) => (
                  <Input {...props} name="vat_number" inputMode="numeric" defaultValue={initial('vat_number', agency.vat_number ?? '')} />
                )}
              </Field>
              <Field label="Codice fiscale" error={state.fieldErrors?.tax_code}>
                {(props) => <Input {...props} name="tax_code" defaultValue={initial('tax_code', agency.tax_code ?? '')} />}
              </Field>
              <Field label="Numero REA" error={state.fieldErrors?.rea_number}>
                {(props) => <Input {...props} name="rea_number" defaultValue={initial('rea_number', agency.rea_number ?? '')} />}
              </Field>
              <Field
                label="Ufficio REA"
                hint="La sigla della provincia della Camera di Commercio, due lettere."
                error={state.fieldErrors?.rea_office}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="rea_office"
                    maxLength={2}
                    defaultValue={initial('rea_office', agency.rea_office ?? '')}
                  />
                )}
              </Field>
              <Field
                label="Autorizzazione all’esercizio"
                hint="Numero della licenza rilasciata dalla Regione o dal Comune."
                error={state.fieldErrors?.license_number}
              >
                {(props) => <Input {...props} name="license_number" defaultValue={initial('license_number', agency.license_number ?? '')} />}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Fattura elettronica</legend>
            <p className="text-small text-text-muted">
              Questi dati finiscono nel file XML che viene trasmesso al Sistema di Interscambio.
              Sbagliarne uno significa vedersi respingere la fattura giorni dopo averla emessa.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Regime fiscale"
                required
                hint="Le agenzie di viaggio in 74-ter restano quasi sempre in regime ordinario."
                error={state.fieldErrors?.sdi_regime}
              >
                {(props) => (
                  <SelectCodice
                    id={props.id}
                    name="sdi_regime"
                    voci={REGIMI_FISCALI}
                    defaultValue={initial('sdi_regime', agency.sdi_regime)}
                  />
                )}
              </Field>
              <Field
                label="Capitale sociale"
                hint="Solo per le società di capitali che dichiarano il REA."
                error={state.fieldErrors?.share_capital}
              >
                {(props) => (
                  <Input
                    {...props}
                    name="share_capital"
                    inputMode="decimal"
                    placeholder="10.000,00"
                    defaultValue={initial(
                      'share_capital',
                      agency.share_capital_cents === null
                        ? ''
                        : (agency.share_capital_cents / 100).toFixed(2).replace('.', ','),
                    )}
                  />
                )}
              </Field>
            </div>
            <div className="space-y-3">
              <label className="flex items-start gap-3 text-body text-text">
                <Checkbox name="sole_shareholder" defaultChecked={agency.sole_shareholder} />
                <span>
                  Socio unico
                  <span className="block text-small text-text-muted">
                    Da indicare se l’intero capitale è di una sola persona.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-body text-text">
                <Checkbox name="in_liquidation" defaultChecked={agency.in_liquidation} />
                <span>
                  Società in liquidazione
                  <span className="block text-small text-text-muted">
                    Lasciare vuoto se l’attività è in esercizio.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Sede</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Indirizzo" className="sm:col-span-2" error={state.fieldErrors?.address_line}>
                {(props) => <Input {...props} name="address_line" defaultValue={initial('address_line', agency.address_line ?? '')} />}
              </Field>
              <Field label="CAP" error={state.fieldErrors?.postal_code}>
                {(props) => (
                  <Input {...props} name="postal_code" inputMode="numeric" defaultValue={initial('postal_code', agency.postal_code ?? '')} />
                )}
              </Field>
              <Field label="Città" error={state.fieldErrors?.city}>
                {(props) => <Input {...props} name="city" defaultValue={initial('city', agency.city ?? '')} />}
              </Field>
              <Field label="Provincia" hint="Sigla di due lettere." error={state.fieldErrors?.province}>
                {(props) => (
                  <Input {...props} name="province" maxLength={2} defaultValue={initial('province', agency.province ?? '')} />
                )}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-small font-semibold text-text">Contatti e pagamenti</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={state.fieldErrors?.email}>
                {(props) => <Input {...props} name="email" type="email" defaultValue={initial('email', agency.email ?? '')} />}
              </Field>
              <Field label="PEC" error={state.fieldErrors?.pec}>
                {(props) => <Input {...props} name="pec" type="email" defaultValue={initial('pec', agency.pec ?? '')} />}
              </Field>
              <Field label="Telefono" error={state.fieldErrors?.phone}>
                {(props) => <Input {...props} name="phone" type="tel" defaultValue={initial('phone', agency.phone ?? '')} />}
              </Field>
              <Field label="Sito web" error={state.fieldErrors?.website}>
                {(props) => <Input {...props} name="website" type="url" defaultValue={initial('website', agency.website ?? '')} />}
              </Field>
              <Field
                label="IBAN"
                className="sm:col-span-2"
                hint="Compare sulle fatture come coordinate per il bonifico."
                error={state.fieldErrors?.iban}
              >
                {(props) => <Input {...props} name="iban" defaultValue={initial('iban', agency.iban ?? '')} />}
              </Field>
              <Field
                label="Polizza assicurativa"
                className="sm:col-span-2"
                hint="Estremi della polizza obbligatoria a garanzia dei viaggiatori."
                error={state.fieldErrors?.insurance_policy}
              >
                {(props) => <Input {...props} name="insurance_policy" defaultValue={initial('insurance_policy', agency.insurance_policy ?? '')} />}
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
