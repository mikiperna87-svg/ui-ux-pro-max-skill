'use client'

import { Bookmark, BookmarkPlus, Check, Trash2, Users } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import { cn } from '@/lib/utils'
import { deleteViewAction, saveViewAction } from '@/server/actions/pratiche'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export interface SavedView {
  readonly id: string
  readonly name: string
  readonly query: string
  readonly shared: boolean
  readonly mine: boolean
}

/**
 * Viste salvate di un elenco.
 *
 * Una vista è un nome dato alla query string corrente: "Partenze del mese non
 * saldate" è più veloce da richiamare che da ricostruire con quattro filtri, e
 * resta un indirizzo normale, condivisibile e con il tasto indietro che
 * funziona. Le viste condivise (create dal titolare) valgono per tutta
 * l'agenzia; le altre sono di chi le ha salvate.
 */
export function SavedViews({
  entity,
  views,
  canWrite,
  canShare,
}: {
  entity: 'pratiche' | 'preventivi' | 'clienti' | 'passeggeri' | 'fornitori'
  views: readonly SavedView[]
  canWrite: boolean
  canShare: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const [state, submit] = useActionState(saveViewAction, IDLE)

  const queryCorrente = searchParams.toString()
  const attiva = views.find((view) => view.query === queryCorrente)

  function applica(view: SavedView) {
    router.push(view.query === '' ? pathname : `${pathname}?${view.query}`)
  }

  function elimina(view: SavedView) {
    startTransition(async () => {
      const esito = await deleteViewAction(view.id, entity)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Vista eliminata.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare la vista.')
      }
    })
  }

  // Il dialogo si chiude da solo quando il salvataggio va a buon fine.
  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false)
      toast.success(state.message ?? 'Vista salvata.')
      router.refresh()
    }
    // toast e router sono stabili: dipendere da loro riaprirebbe il giro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm">
            <Bookmark aria-hidden="true" />
            {attiva ? attiva.name : 'Viste'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuLabel>Viste salvate</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => router.push(pathname)}>
            <span className="flex-1">Tutte le righe</span>
            {queryCorrente === '' ? <Check className="size-3.5" aria-hidden="true" /> : null}
          </DropdownMenuItem>

          {views.length === 0 ? (
            <p className="px-2 py-2 text-caption text-text-muted">
              Nessuna vista salvata. Imposta i filtri che usi spesso e salvali con un nome.
            </p>
          ) : (
            views.map((view) => (
              <DropdownMenuItem key={view.id} onSelect={() => applica(view)}>
                <span className={cn('flex-1 truncate', attiva?.id === view.id && 'font-medium')}>
                  {view.name}
                </span>
                {view.shared ? (
                  <>
                    <Users className="size-3.5 text-text-subtle" aria-hidden="true" />
                    <span className="sr-only">vista condivisa con l’agenzia</span>
                  </>
                ) : null}
                {attiva?.id === view.id ? <Check className="size-3.5" aria-hidden="true" /> : null}
                {view.mine ? (
                  // L'eliminazione sta sulla riga della vista, non in un secondo
                  // elenco: due volte lo stesso nome nello stesso menu si legge
                  // come un doppione, non come due comandi diversi.
                  <button
                    type="button"
                    aria-label={`Elimina la vista ${view.name}`}
                    className="rounded p-0.5 text-text-subtle transition-colors hover:text-danger"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      elimina(view)
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canWrite ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <BookmarkPlus aria-hidden="true" />
            {/* Una sola etichetta: `EtichettaBottone` sparisce alla vista sullo
                schermo stretto ma resta a chi ascolta, e il vecchio doppione
                per il telefono faceva annunciare "Salva vistaSalva questa
                vista". */}
            <EtichettaBottone>Salva vista</EtichettaBottone>
          </Button>
          <DialogContent size="sm">
            <form action={submit}>
              <DialogHeader>
                <DialogTitle>Salva la vista</DialogTitle>
                <DialogDescription>
                  Filtri, ricerca e ordinamento di questo elenco vengono salvati con un nome.
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <input type="hidden" name="entity" value={entity} />
                <input type="hidden" name="query" value={queryCorrente} />

                <Field label="Nome della vista" required error={state.fieldErrors?.name}>
                  {(props) => (
                    <Input
                      {...props}
                      name="name"
                      placeholder="Partenze del mese non saldate"
                      defaultValue={state.values?.name ?? ''}
                    />
                  )}
                </Field>

                {canShare ? (
                  <label className="flex items-start gap-2.5 text-small text-text">
                    <Checkbox name="shared" className="mt-0.5" />
                    Condividi con tutta l’agenzia
                  </label>
                ) : null}

                <FormMessage status={state.status} message={state.message} />
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Annulla
                </Button>
                <SubmitButton pendingLabel="Salvataggio...">Salva</SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
