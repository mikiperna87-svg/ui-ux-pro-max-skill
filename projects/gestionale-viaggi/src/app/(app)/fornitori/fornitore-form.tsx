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
import { Switch } from '@/components/ui/switch'
import { IDLE } from '@/lib/action-state'
import type { Enums, Tables } from '@/lib/database.types'
import { SUPPLIER_KIND, VAT_REGIME } from '@/lib/labels'
import { saveSupplierAction } from '@/server/actions/anagrafiche'

export function FornitoreForm({ supplier }: { supplier?: Tables<'suppliers'> }) {
  const [state, submit] = useActionState(saveSupplierAction, IDLE)
  // Dopo una Server Action React azzera i campi non controllati: i valori
  // rimandati indietro dall’azione tornano a essere i default, cosi’ chi ha
  // sbagliato un carattere corregge quello invece di ridigitare il modulo.
  const initial = (field: string, fallback?: string | number | null) =>
    state.values?.[field] ?? (fallback === null || fallback === undefined ? '' : String(fallback))
  const [dirty, setDirty] = useState(false)
  const [kind, setKind] = useState<Enums['supplier_kind']>(supplier?.kind ?? 'tour_operator')
  const [regime, setRegime] = useState<Enums['vat_regime']>(supplier?.default_vat_regime ?? 'art_74_ter')
  const [active, setActive] = useState(supplier?.is_active ?? true)

  const backHref = supplier ? `/fornitori/${supplier.id}` : '/fornitori'

  return (
    <form
      action={submit}
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
      className="space-y-4"
    >
      <UnsavedChangesGuard when={dirty} />
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="default_vat_regime" value={regime} />
      <input type="hidden" name="country" value={supplier?.country ?? 'IT'} />
      {active ? <input type="hidden" name="is_active" value="on" /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Identificazione</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" required error={state.fieldErrors?.name}>
              {(props) => <Input {...props} name="name" defaultValue={initial('name', supplier?.name ?? '')} required />}
            </Field>
            <Field label="Tipo" required error={state.fieldErrors?.kind}>
              {(props) => (
                <Select
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value as Enums['supplier_kind'])
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id={props.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPPLIER_KIND).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Ragione sociale" error={state.fieldErrors?.legal_name}>
              {(props) => <Input {...props} name="legal_name" defaultValue={initial('legal_name', supplier?.legal_name ?? '')} />}
            </Field>
            <Field
              label="Partita IVA"
              hint="Undici cifre per l’Italia, oppure l’identificativo estero."
              error={state.fieldErrors?.vat_number}
            >
              {(props) => <Input {...props} name="vat_number" defaultValue={initial('vat_number', supplier?.vat_number ?? '')} />}
            </Field>
            <Field label="Codice fiscale" error={state.fieldErrors?.tax_code}>
              {(props) => <Input {...props} name="tax_code" defaultValue={initial('tax_code', supplier?.tax_code ?? '')} />}
            </Field>
            <Field label="Portale prenotazioni" error={state.fieldErrors?.booking_portal_url}>
              {(props) => (
                <Input {...props} name="booking_portal_url" type="url" placeholder="https://" defaultValue={initial('booking_portal_url', supplier?.booking_portal_url ?? '')} />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contatti e sede</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Referente" error={state.fieldErrors?.contact_name}>
              {(props) => <Input {...props} name="contact_name" defaultValue={initial('contact_name', supplier?.contact_name ?? '')} />}
            </Field>
            <Field label="Email" error={state.fieldErrors?.email}>
              {(props) => <Input {...props} name="email" type="email" defaultValue={initial('email', supplier?.email ?? '')} />}
            </Field>
            <Field label="PEC" error={state.fieldErrors?.pec}>
              {(props) => <Input {...props} name="pec" type="email" defaultValue={initial('pec', supplier?.pec ?? '')} />}
            </Field>
            <Field label="Telefono" error={state.fieldErrors?.phone}>
              {(props) => <Input {...props} name="phone" type="tel" defaultValue={initial('phone', supplier?.phone ?? '')} />}
            </Field>
            <Field label="Indirizzo" className="sm:col-span-2" error={state.fieldErrors?.address_line}>
              {(props) => <Input {...props} name="address_line" defaultValue={initial('address_line', supplier?.address_line ?? '')} />}
            </Field>
            <Field label="CAP" error={state.fieldErrors?.postal_code}>
              {(props) => (
                <Input {...props} name="postal_code" inputMode="numeric" maxLength={5} defaultValue={initial('postal_code', supplier?.postal_code ?? '')} />
              )}
            </Field>
            <Field label="Città" error={state.fieldErrors?.city}>
              {(props) => <Input {...props} name="city" defaultValue={initial('city', supplier?.city ?? '')} />}
            </Field>
            <Field label="Provincia" error={state.fieldErrors?.province}>
              {(props) => <Input {...props} name="province" maxLength={2} defaultValue={initial('province', supplier?.province ?? '')} />}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>Condizioni commerciali</CardTitle>
            <p className="text-small text-text-muted">
              Questi valori vengono proposti come predefiniti su ogni nuova riga di servizio.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Giorni di pagamento"
              hint="Dilazione concessa: guida il calcolo delle scadenze."
              error={state.fieldErrors?.payment_terms_days}
            >
              {(props) => (
                <Input
                  {...props}
                  name="payment_terms_days"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={initial('payment_terms_days', supplier?.payment_terms_days ?? 30)}
                />
              )}
            </Field>
            <Field
              label="Commissione predefinita (%)"
              hint="Provvigione riconosciuta sul venduto."
              error={state.fieldErrors?.default_commission_percent}
            >
              {(props) => (
                <Input
                  {...props}
                  name="default_commission_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={initial('default_commission_percent', (supplier?.default_commission_bps ?? 0) / 100)}
                />
              )}
            </Field>
            <Field
              label="Regime IVA predefinito"
              hint={VAT_REGIME[regime].note}
              className="sm:col-span-2"
              error={state.fieldErrors?.default_vat_regime}
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
                    <SelectValue />
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
              label="IBAN"
              className="sm:col-span-2"
              hint="Usato per predisporre i bonifici."
              error={state.fieldErrors?.iban}
            >
              {(props) => <Input {...props} name="iban" defaultValue={initial('iban', supplier?.iban ?? '')} />}
            </Field>
          </div>

          <Field label="Note" error={state.fieldErrors?.notes}>
            {(props) => (
              <Textarea {...props} name="notes" rows={3} placeholder="Accordi particolari, referenti per emergenze, penali." defaultValue={initial('notes', supplier?.notes ?? '')} />
            )}
          </Field>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <div className="space-y-0.5">
              <p className="text-small font-medium text-text">Fornitore attivo</p>
              <p className="text-caption text-text-muted">
                Un fornitore disattivato resta nello storico ma non compare più fra quelli
                selezionabili.
              </p>
            </div>
            <Switch
              checked={active}
              onCheckedChange={(value) => {
                setActive(value)
                setDirty(true)
              }}
              aria-label="Fornitore attivo"
            />
          </div>

          <FormMessage status={state.status} message={state.message} />
        </CardContent>
        <CardFooter>
          <Button asChild variant="ghost">
            <Link href={backHref}>Annulla</Link>
          </Button>
          <SubmitButton pendingLabel="Salvataggio...">
            {supplier ? 'Salva le modifiche' : 'Crea il fornitore'}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
