'use client'

import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { IDLE } from '@/lib/action-state'
import { requestPasswordResetAction } from '@/server/actions/auth'

export function RecuperaForm() {
  const [state, submit] = useActionState(requestPasswordResetAction, IDLE)

  return (
    <form action={submit} className="space-y-4" noValidate>
      <Field label="Email" required error={state.fieldErrors?.email}>
        {(props) => (
          <Input {...props} name="email" type="email" autoComplete="username" autoFocus placeholder="nome@agenzia.it" required />
        )}
      </Field>

      <FormMessage status={state.status} message={state.message} />

      <SubmitButton block pendingLabel="Invio in corso...">
        Inviami le istruzioni
      </SubmitButton>
    </form>
  )
}
