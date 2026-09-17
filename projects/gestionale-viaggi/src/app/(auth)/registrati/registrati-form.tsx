'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { IDLE } from '@/lib/action-state'
import { signUpAction } from '@/server/actions/auth'

export function RegistratiForm() {
  const [state, submit] = useActionState(signUpAction, IDLE)

  return (
    <form action={submit} className="space-y-4" noValidate>
      <Field label="Nome dell’agenzia" required error={state.fieldErrors?.agencyName}>
        {(props) => (
          <Input {...props} name="agencyName" autoComplete="organization" placeholder="Orizzonti Viaggi" required />
        )}
      </Field>

      <Field label="Nome e cognome" required error={state.fieldErrors?.fullName}>
        {(props) => <Input {...props} name="fullName" autoComplete="name" placeholder="Giulia Marchetti" required />}
      </Field>

      <Field
        label="Partita IVA"
        hint="Facoltativa ora, necessaria per emettere fatture."
        error={state.fieldErrors?.vatNumber}
      >
        {(props) => <Input {...props} name="vatNumber" inputMode="numeric" placeholder="03918470127" />}
      </Field>

      <Field label="Email" required error={state.fieldErrors?.email}>
        {(props) => (
          <Input {...props} name="email" type="email" autoComplete="username" placeholder="nome@agenzia.it" required />
        )}
      </Field>

      <Field
        label="Password"
        required
        hint="Almeno 10 caratteri, con maiuscole, minuscole e numeri."
        error={state.fieldErrors?.password}
      >
        {(props) => <Input {...props} name="password" type="password" autoComplete="new-password" required />}
      </Field>

      <FormMessage status={state.status} message={state.message} />

      <SubmitButton block pendingLabel="Creazione in corso...">
        Crea l’agenzia
      </SubmitButton>

      <p className="text-center text-small text-text-muted">
        Hai già un account?{' '}
        <Link href="/accedi" className="text-accent underline-offset-4 hover:underline">
          Accedi
        </Link>
      </p>
    </form>
  )
}
