'use client'

import { Power } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { toggleSupplierActiveAction } from '@/server/actions/anagrafiche'

/** Attiva o disattiva un fornitore senza perderne lo storico. */
export function StatoFornitore({ supplierId, active }: { supplierId: string; active: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await toggleSupplierActiveAction(supplierId, !active)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Aggiornato.')
        router.refresh()
      } else {
        toast.error(result.message ?? 'Operazione non riuscita.')
      }
    })
  }

  return (
    <Button variant="secondary" size="sm" onClick={toggle} disabled={pending}>
      <Power aria-hidden="true" />
      {active ? 'Disattiva' : 'Riattiva'}
    </Button>
  )
}
