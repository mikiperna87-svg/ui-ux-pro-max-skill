'use client'

import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import type { Tables } from '@/lib/database.types'
import { formatDateTime } from '@/lib/date'
import {
  deleteDocumentAction,
  signedDocumentUrlAction,
  uploadBookingDocumentAction,
} from '@/server/actions/documenti'

const DOCUMENT_KIND: Record<string, string> = {
  voucher: 'Voucher',
  contratto: 'Contratto',
  documento_identita: 'Documento d’identità',
  assicurazione: 'Assicurazione',
  fattura_fornitore: 'Fattura fornitore',
  preventivo: 'Preventivo',
  fattura: 'Fattura',
  altro: 'Altro',
}

/** Dimensione leggibile: 1,2 MB dice più di 1258291 byte. */
function peso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Documenti allegati alla pratica.
 *
 * I file stanno in un deposito privato: non esiste un indirizzo pubblico da
 * indovinare. Ogni apertura chiede al server un collegamento firmato che vale
 * cinque minuti, il tempo di scaricare il file.
 */
export function DocumentiPratica({
  bookingId,
  documents,
  canWrite,
}: {
  bookingId: string
  documents: readonly Tables<'documents'>[]
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('voucher')
  const [state, submit] = useActionState(uploadBookingDocumentAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      setOpen(false)
      toast.success(state.message ?? 'Documento allegato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function apri(documentId: string) {
    startTransition(async () => {
      const esito = await signedDocumentUrlAction(documentId)
      if ('url' in esito) {
        window.open(esito.url, '_blank', 'noopener,noreferrer')
      } else {
        toast.error(esito.error)
      }
    })
  }

  function elimina(documentId: string) {
    startTransition(async () => {
      const esito = await deleteDocumentAction(documentId, bookingId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Documento eliminato.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare il documento.')
      }
    })
  }

  return (
    <div className="space-y-3">
      {canWrite && documents.length > 0 ? (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Upload aria-hidden="true" />
            Allega un documento
          </Button>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState
          icon={<Paperclip />}
          title="Nessun documento allegato"
          description="Voucher, contratti, copie dei documenti d’identità: restano qui, al riparo, e si aprono solo con un collegamento temporaneo."
          action={
            canWrite ? (
              <Button variant="primary" onClick={() => setOpen(true)}>
                Allega il primo documento
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {documents.map((documento) => (
            <li key={documento.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-text">{documento.file_name}</p>
                <p className="text-caption text-text-muted">
                  {peso(documento.size_bytes)} · {formatDateTime(documento.created_at)}
                  {documento.notes ? ` · ${documento.notes}` : ''}
                </p>
              </div>
              <Badge tone="neutral">{DOCUMENT_KIND[documento.kind] ?? documento.kind}</Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Apri ${documento.file_name}`}
                onClick={() => apri(documento.id)}
              >
                <Download className="size-3.5" aria-hidden="true" />
              </Button>
              {canWrite ? (
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Elimina ${documento.file_name}`}
                    >
                      <Trash2 className="size-3.5 text-danger" aria-hidden="true" />
                    </Button>
                  }
                  title="Eliminare il documento?"
                  description="Il file viene rimosso dal deposito e non è più recuperabile."
                  confirmLabel="Elimina"
                  onConfirm={() => elimina(documento.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form action={submit}>
            <DialogHeader>
              <DialogTitle>Allega un documento</DialogTitle>
              <DialogDescription>
                PDF, immagini e documenti Office fino a 20 MB. Il file resta privato: si apre solo
                con un collegamento firmato che scade.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <input type="hidden" name="booking_id" value={bookingId} />
              <input type="hidden" name="kind" value={kind} />

              <Field label="Tipo di documento">
                {(props) => (
                  <Select value={kind} onValueChange={setKind}>
                    <SelectTrigger id={props.id}>
                      <SelectValue>{DOCUMENT_KIND[kind]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_KIND).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field label="File" required>
                {(props) => (
                  <input
                    {...props}
                    type="file"
                    name="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.xlsx"
                    className="block w-full text-small text-text file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-small file:text-text hover:file:border-border-strong"
                  />
                )}
              </Field>

              <Field label="Nota">
                {(props) => <Input {...props} name="notes" placeholder="Voucher hotel, 3 notti" />}
              </Field>

              <FormMessage status={state.status} message={state.message} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annulla
              </Button>
              <SubmitButton pendingLabel="Caricamento...">Allega</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
