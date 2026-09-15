'use client'

import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface ConfirmDialogProps {
  /** Elemento che apre la finestra: viene reso interattivo dal componente. */
  readonly trigger: ReactNode
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly onConfirm: () => void | Promise<void>
  /**
   * Riferimento da digitare per confermare (es. il numero della pratica).
   * Obbligatorio per le azioni che non si possono annullare.
   */
  readonly requireTyping?: string
  readonly busyLabel?: string
}

/** Conferma esplicita per le azioni distruttive: niente "sei sicuro?" a vuoto. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Conferma',
  onConfirm,
  requireTyping,
  busyLabel = 'Attendere...',
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const inputId = useId()

  const canConfirm = !requireTyping || typed.trim() === requireTyping

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
      setTyped('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTyped('')
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireTyping ? (
          <DialogBody className="space-y-2">
            <label htmlFor={inputId} className="block text-small text-text">
              Per confermare digita <span className="font-semibold num">{requireTyping}</span>
            </label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              placeholder={requireTyping}
            />
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Annulla
          </Button>
          <Button variant="danger" onClick={handleConfirm} disabled={!canConfirm || busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
