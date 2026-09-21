'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IDLE } from '@/lib/action-state'
import { magicLinkAction, signInAction } from '@/server/actions/auth'

export function AccediForm({ successivo }: { successivo: string }) {
  const [passwordState, submitPassword] = useActionState(signInAction, IDLE)
  const [magicState, submitMagic] = useActionState(magicLinkAction, IDLE)

  return (
    <div className="space-y-5">
      {/* Due modi di entrare, non due sezioni di contenuto: le schede di Radix
          danno da sole la semantica corretta e la navigazione con le frecce. */}
      <Tabs defaultValue="password">
        <TabsList variant="segmented" aria-label="Metodo di accesso">
          <TabsTrigger variant="segmented" value="password">
            Password
          </TabsTrigger>
          <TabsTrigger variant="segmented" value="magic-link">
            Link via email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password">
          <form action={submitPassword} className="space-y-4" noValidate>
            <input type="hidden" name="successivo" value={successivo} />

            <Field label="Email" required error={passwordState.fieldErrors?.email}>
              {(props) => (
                <Input
                  {...props}
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="nome@agenzia.it"
                  required
                />
              )}
            </Field>

            <Field label="Password" required error={passwordState.fieldErrors?.password}>
              {(props) => (
                <Input {...props} name="password" type="password" autoComplete="current-password" required />
              )}
            </Field>

            <FormMessage status={passwordState.status} message={passwordState.message} />

            <SubmitButton block pendingLabel="Accesso in corso...">
              Accedi
            </SubmitButton>
          </form>
        </TabsContent>

        <TabsContent value="magic-link">
          <form action={submitMagic} className="space-y-4" noValidate>
            <input type="hidden" name="successivo" value={successivo} />

            <Field
              label="Email"
              required
              hint="Ti inviamo un link valido una sola volta: nessuna password da ricordare."
              error={magicState.fieldErrors?.email}
            >
              {(props) => (
                <Input
                  {...props}
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="nome@agenzia.it"
                  required
                />
              )}
            </Field>

            <FormMessage status={magicState.status} message={magicState.message} />

            <SubmitButton block pendingLabel="Invio in corso...">
              Inviami il link di accesso
            </SubmitButton>
          </form>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between text-small">
        <Link href="/recupera-password" className="text-accent underline underline-offset-4 hover:no-underline">
          Password dimenticata?
        </Link>
        <Link href="/registrati" className="text-text-muted underline-offset-4 hover:text-text hover:underline">
          Crea un’agenzia
        </Link>
      </div>
    </div>
  )
}
