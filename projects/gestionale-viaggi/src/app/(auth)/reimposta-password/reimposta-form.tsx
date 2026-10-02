'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { IDLE } from '@/lib/action-state'
import { updatePasswordAction } from '@/server/actions/auth'

export function ReimpostaForm() {
  const [state, submit] = useActionState(updatePasswordAction, IDLE)

  return (
    <form action={submit} className="space-y-4" noValidate>
      <Field
        label="Nuova password"
        required
        hint="Almeno 10 caratteri, con maiuscole, minuscole e numeri."
        error={state.fieldErrors?.password}
      >
        {(props) => <Input {...props} name="password" type="password" autoComplete="new-password" autoFocus required />}
      </Field>

      <Field label="Conferma la password" required error={state.fieldErrors?.conferma}>
        {(props) => <Input {...props} name="conferma" type="password" autoComplete="new-password" required />}
      </Field>

      <FormMessage status={state.status} message={state.message} />

      <SubmitButton block pendingLabel="Salvataggio...">
        Salva la nuova password
      </SubmitButton>
    </form>
  )
}
