'use client'

import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonProps } from '@/components/ui/button'

/**
 * Bottone di invio che conosce lo stato del form che lo contiene: si disabilita
 * da solo durante l invio, senza che la pagina debba gestire un flag.
 *
 * `pending` serve ai pochi moduli che non affidano l'invio a `<form action>` e
 * quindi non hanno uno stato del form da cui leggere: lo dichiarano loro.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Attendere...',
  pending: pendingEsterno,
  ...props
}: ButtonProps & { pendingLabel?: string; pending?: boolean }) {
  const stato = useFormStatus()
  const pending = pendingEsterno ?? stato.pending
  return (
    <Button type="submit" variant="primary" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
