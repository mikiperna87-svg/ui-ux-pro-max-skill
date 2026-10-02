'use client'

import { Download, EllipsisVertical, ShieldOff } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { anonymizeCustomerAction } from '@/server/actions/anagrafiche'

/** Azioni sulla scheda cliente che richiedono una conferma esplicita. */
export function AzioniCliente({
  customerId,
  customerName,
  canAnonymize,
}: {
  customerId: string
  customerName: string
  canAnonymize: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  function anonymize() {
    startTransition(async () => {
      const result = await anonymizeCustomerAction(customerId)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Scheda anonimizzata.')
        router.refresh()
      } else {
        toast.error(result.message ?? 'Operazione non riuscita.')
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon-sm" aria-label="Altre azioni">
          <EllipsisVertical className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuItem asChild>
          <a href={`/clienti/${customerId}/dati`} download>
            <Download aria-hidden="true" />
            Esporta i dati (GDPR)
          </a>
        </DropdownMenuItem>
        {canAnonymize ? (
          <>
            <DropdownMenuSeparator />
            <ConfirmDialog
              trigger={
                <DropdownMenuItem
                  variant="danger"
                  onSelect={(event) => event.preventDefault()}
                >
                  <ShieldOff aria-hidden="true" />
                  Anonimizza su richiesta
                </DropdownMenuItem>
              }
              title="Anonimizzare la scheda?"
              description="Nome, contatti e note vengono rimossi in modo definitivo. Importi, date e riferimenti dei documenti fiscali restano, perché la legge impone di conservarli. L’operazione non si può annullare."
              confirmLabel="Anonimizza"
              requireTyping={customerName}
              onConfirm={anonymize}
            />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
