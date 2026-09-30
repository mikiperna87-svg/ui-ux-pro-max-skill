'use client'

import { PauseCircle, PlayCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { riattivaAgenziaAction, sospendiAgenziaAction } from '@/server/actions/piattaforma'

/**
 * Sospendere e riattivare un'agenzia.
 *
 * Il motivo è obbligatorio e finisce nel registro attività dell'agenzia: chi
 * ci lavora si troverà il gestionale in sola lettura, e deve poter leggere
 * perché invece di telefonare per scoprirlo.
 */
export function AzioniAgenzia({
  agencyId,
  nome,
  sospesa,
}: {
  agencyId: string
  nome: string
  sospesa: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [inCorso, startTransition] = useTransition()
  const [aperto, setAperto] = useState(false)
  const [motivo, setMotivo] = useState('')

  function sospendi() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', agencyId)
      formData.set('motivo', motivo)
      const esito = await sospendiAgenziaAction({ status: 'idle' }, formData)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Agenzia sospesa.')
        setAperto(false)
        setMotivo('')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a sospendere l’agenzia.')
      }
    })
  }

  function riattiva() {
    startTransition(async () => {
      const esito = await riattivaAgenziaAction(agencyId)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Agenzia riattivata.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a riattivare l’agenzia.')
      }
    })
  }

  if (sospesa) {
    return (
      <Button variant="secondary" size="sm" onClick={riattiva} disabled={inCorso}>
        <PlayCircle aria-hidden="true" />
        Riattiva
      </Button>
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAperto(true)} disabled={inCorso}>
        <PauseCircle aria-hidden="true" />
        Sospendi
      </Button>

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sospendere {nome}?</DialogTitle>
            <DialogDescription>
              L’agenzia continuerà a leggere ed esportare i propri dati, ma non potrà più
              registrarne di nuovi. Il motivo comparirà nel suo registro attività.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Motivo" required>
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Abbonamento scaduto il 31/03, secondo sollecito senza risposta."
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAperto(false)} disabled={inCorso}>
              Annulla
            </Button>
            <Button onClick={sospendi} disabled={motivo.trim().length < 3 || inCorso}>
              Sospendi l’agenzia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
