'use client'

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import type { NavItem } from '@/lib/navigation'

interface Scorciatoia {
  readonly keys: readonly string[]
  readonly description: string
}

const GENERALI: readonly Scorciatoia[] = [
  { keys: ['⌘', 'K'], description: 'Apri ricerca e comandi' },
  { keys: ['⌘', '/'], description: 'Mostra questo elenco' },
]

const CHIUSURA: readonly Scorciatoia[] = [
  { keys: ['Esc'], description: 'Chiudi la finestra attiva' },
  { keys: ['Tab'], description: 'Sposta il fuoco al comando successivo' },
]

export function ShortcutsDialog({
  open,
  onOpenChange,
  sezioni,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Le sezioni visibili all'utente: l'elenco mostra solo tasti che funzionano. */
  sezioni: readonly NavItem[]
}) {
  const scorciatoie: readonly Scorciatoia[] = [
    ...GENERALI,
    ...sezioni.flatMap((item) =>
      item.shortcut
        ? [{ keys: ['G', item.shortcut.toUpperCase()], description: `Vai a: ${item.label}` }]
        : [],
    ),
    ...CHIUSURA,
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Scorciatoie da tastiera</DialogTitle>
          <DialogDescription>Tutte le azioni frequenti si raggiungono senza mouse.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="divide-y divide-border">
            {scorciatoie.map((shortcut) => (
              <div key={shortcut.description} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-small text-text">{shortcut.description}</dt>
                <dd className="flex items-center gap-1">
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
