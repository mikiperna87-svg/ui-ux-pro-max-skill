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

const SHORTCUTS: ReadonlyArray<{ keys: readonly string[]; description: string }> = [
  { keys: ['⌘', 'K'], description: 'Apri ricerca e comandi' },
  { keys: ['⌘', '/'], description: 'Mostra questo elenco' },
  { keys: ['G', 'P'], description: 'Vai alla panoramica' },
  { keys: ['G', 'I'], description: 'Vai alle impostazioni' },
  { keys: ['Esc'], description: 'Chiudi la finestra attiva' },
  { keys: ['Tab'], description: 'Sposta il fuoco al comando successivo' },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Scorciatoie da tastiera</DialogTitle>
          <DialogDescription>Tutte le azioni frequenti si raggiungono senza mouse.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="divide-y divide-border">
            {SHORTCUTS.map((shortcut) => (
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
