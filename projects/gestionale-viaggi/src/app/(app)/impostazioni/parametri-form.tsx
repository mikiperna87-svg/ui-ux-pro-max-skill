'use client'

import { useActionState, useState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { Tables } from '@/lib/database.types'
import { IDLE } from '@/lib/action-state'
import { updateSettingsAction } from '@/server/actions/settings'

export function ParametriForm({ settings }: { settings: Tables<'agency_settings'> }) {
  const [state, submit] = useActionState(updateSettingsAction, IDLE)
  const [hideMargins, setHideMargins] = useState(settings.hide_margins_from_operators)

  return (
    <form action={submit} noValidate className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Scadenze automatiche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-small text-text-muted">
            Alla conferma di una pratica il sistema genera acconto, saldo e il controllo dei documenti
            dei passeggeri usando questi valori.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Acconto entro (giorni)"
              hint="Dalla data di conferma."
              error={state.fieldErrors?.deposit_due_days}
            >
              {(props) => (
                <Input
                  {...props}
                  name="deposit_due_days"
                  type="number"
                  min={0}
                  max={90}
                  defaultValue={settings.deposit_due_days}
                />
              )}
            </Field>
            <Field
              label="Acconto (%)"
              hint="Quota richiesta alla conferma."
              error={state.fieldErrors?.deposit_percent}
            >
              {(props) => (
                <Input
                  {...props}
                  name="deposit_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={settings.deposit_percent_bps / 100}
                />
              )}
            </Field>
            <Field
              label="Saldo (giorni prima)"
              hint="Prima della partenza."
              error={state.fieldErrors?.balance_due_days_before_departure}
            >
              {(props) => (
                <Input
                  {...props}
                  name="balance_due_days_before_departure"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={settings.balance_due_days_before_departure}
                />
              )}
            </Field>
            <Field
              label="Avviso documenti (giorni)"
              hint="Segnala i documenti in scadenza entro questo margine."
              error={state.fieldErrors?.passenger_document_alert_days}
            >
              {(props) => (
                <Input
                  {...props}
                  name="passenger_document_alert_days"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={settings.passenger_document_alert_days}
                />
              )}
            </Field>
            <Field
              label="Validità preventivi (giorni)"
              error={state.fieldErrors?.quote_validity_days}
            >
              {(props) => (
                <Input
                  {...props}
                  name="quote_validity_days"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={settings.quote_validity_days}
                />
              )}
            </Field>
            <Field
              label="Aliquota IVA predefinita (%)"
              hint="Applicata alle nuove righe di servizio."
              error={state.fieldErrors?.default_vat_percent}
            >
              {(props) => (
                <Input
                  {...props}
                  name="default_vat_percent"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  defaultValue={settings.default_vat_bps / 100}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Numerazioni</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-small text-text-muted">
            Il numero progressivo e l’anno sono automatici e senza salti. Qui si sceglie solo il
            prefisso: ad esempio <span className="num">AG</span> produce{' '}
            <span className="num">AG2026/0001</span>.
          </p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Pratiche" error={state.fieldErrors?.booking_number_prefix}>
              {(props) => (
                <Input {...props} name="booking_number_prefix" maxLength={8} defaultValue={settings.booking_number_prefix} />
              )}
            </Field>
            <Field label="Preventivi" error={state.fieldErrors?.quote_number_prefix}>
              {(props) => (
                <Input {...props} name="quote_number_prefix" maxLength={8} defaultValue={settings.quote_number_prefix} />
              )}
            </Field>
            <Field label="Fatture" error={state.fieldErrors?.invoice_number_prefix}>
              {(props) => (
                <Input {...props} name="invoice_number_prefix" maxLength={8} defaultValue={settings.invoice_number_prefix} />
              )}
            </Field>
            <Field label="Note di credito" error={state.fieldErrors?.credit_note_number_prefix}>
              {(props) => (
                <Input
                  {...props}
                  name="credit_note_number_prefix"
                  maxLength={8}
                  defaultValue={settings.credit_note_number_prefix}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visibilità</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-small font-medium text-text">Nascondi i margini agli operatori</p>
              <p className="text-caption text-text-muted">
                Gli operatori continuano a vedere prezzi e incassi, ma non il guadagno dell’agenzia.
              </p>
            </div>
            <Switch
              name="hide_margins_from_operators"
              checked={hideMargins}
              onCheckedChange={setHideMargins}
              aria-label="Nascondi i margini agli operatori"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-between">
          <FormMessage status={state.status} message={state.message} className="mr-auto" />
          <SubmitButton pendingLabel="Salvataggio...">Salva i parametri</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}
