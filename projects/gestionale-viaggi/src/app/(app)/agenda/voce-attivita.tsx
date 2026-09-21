'use client'

import { Check, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
} from '@/server/actions/agenda'
import type { TaskRow } from '@/server/queries/agenda'
import { ModuloAttivita } from './modulo-attivita'

/**
 * I comandi di un'attività: completare, riaprire, modificare, eliminare.
 *
 * "Completa" sta fuori dal menu perché è il gesto che si fa dieci volte al
 * giorno, e nasconderlo dietro tre puntini vorrebbe dire due clic invece di
 * uno. Il resto sta nel menu, dove non compete con il gesto principale.
 */
export function AzioniAttivita({
  task,
  operatori,
  completata = false,
}: {
  task: TaskRow
  operatori: ReadonlyArray<{ id: string; label: string }>
  completata?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [modifica, setModifica] = useState(false)
  const [elimina, setElimina] = useState(false)

  const id = task.id ?? ''

  function esegui(azione: (id: string) => Promise<{ status: string; message?: string }>, ripiego: string) {
    startTransition(async () => {
      const esito = await azione(id)
      if (esito.status === 'success') {
        toast.success(esito.message ?? ripiego)
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Operazione non riuscita.')
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {completata ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => esegui(reopenTaskAction, 'Attività riaperta.')}
          >
            <RotateCcw aria-hidden="true" />
            Riapri
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            // Sul telefono resta la sola spunta, per non rubare spazio al
            // titolo: senza questa etichetta il bottone non avrebbe nome per
            // chi naviga con la tastiera o con un lettore di schermo, e
            // sarebbe soltanto "pulsante".
            aria-label={`Completa ${task.title ?? 'l’attività'}`}
            onClick={() => esegui(completeTaskAction, 'Attività completata.')}
          >
            <Check aria-hidden="true" />
            <span className="hidden sm:inline">Completa</span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Altre azioni su ${task.title ?? 'attività'}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setModifica(true)}>
              <Pencil aria-hidden="true" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setElimina(true)}>
              <Trash2 aria-hidden="true" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {modifica ? (
        <ModuloAttivita
          open={modifica}
          onOpenChange={setModifica}
          task={task}
          operatori={operatori}
          bookingId={task.booking_id}
          customerId={task.customer_id}
        />
      ) : null}

      {/* La conferma vive fuori dalla riga che l'attività fa sparire: un
          dialogo dentro l'elemento rimosso se ne va con lui, e l'utente resta
          con lo schermo oscurato (DECISIONI 40). */}
      <ConfirmDialog
        open={elimina}
        onOpenChange={setElimina}
        title="Eliminare l’attività?"
        description="Sparisce dall’agenda. L’operazione resta nel registro delle attività."
        confirmLabel="Elimina"
        onConfirm={() => esegui(deleteTaskAction, 'Attività eliminata.')}
      />
    </>
  )
}
