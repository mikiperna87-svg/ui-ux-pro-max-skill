'use client'

import { CreditCard, PauseCircle, PlayCircle } from 'lucide-react'
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
import { Input, Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import {
  impostaAbbonamentoAction,
  riattivaAgenziaAction,
  sospendiAgenziaAction,
} from '@/server/actions/piattaforma'

const STATI: readonly { valore: string; etichetta: string }[] = [
  { valore: 'prova', etichetta: 'In prova' },
  { valore: 'attivo', etichetta: 'Attivo' },
  { valore: 'scaduto', etichetta: 'Scaduto' },
  { valore: 'annullato', etichetta: 'Annullato' },
]

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
  piani,
  pianoAttuale,
  statoAttuale,
  scadenzaAttuale,
}: {
  agencyId: string
  nome: string
  sospesa: boolean
  piani: readonly { code: string; name: string }[]
  pianoAttuale: string | null
  statoAttuale: string | null
  scadenzaAttuale: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [inCorso, startTransition] = useTransition()
  const [aperto, setAperto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [abbonamento, setAbbonamento] = useState(false)
  const [piano, setPiano] = useState(pianoAttuale ?? piani[0]?.code ?? '')
  const [stato, setStato] = useState(statoAttuale ?? 'prova')
  const [scadenza, setScadenza] = useState(scadenzaAttuale ?? '')

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

  function salvaAbbonamento() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', agencyId)
      formData.set('piano', piano)
      formData.set('stato', stato)
      formData.set('scadenza', scadenza)
      const esito = await impostaAbbonamentoAction({ status: 'idle' }, formData)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Abbonamento aggiornato.')
        setAbbonamento(false)
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a salvare l’abbonamento.')
      }
    })
  }

  const dialogoAbbonamento = (
    <Dialog open={abbonamento} onOpenChange={setAbbonamento}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abbonamento di {nome}</DialogTitle>
          <DialogDescription>
            Uno stato scaduto o annullato, o una data già passata, mettono l’agenzia in sola
            lettura: continua a consultare ed esportare, non a registrare.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Piano" required>
            {(props) => (
              <Select value={piano} onValueChange={setPiano}>
                <SelectTrigger id={props.id}>
                  <SelectValue>
                    {piani.find((p) => p.code === piano)?.name ?? 'Scegli il piano'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {piani.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Stato" required>
            {(props) => (
              <Select value={stato} onValueChange={setStato}>
                <SelectTrigger id={props.id}>
                  <SelectValue>
                    {STATI.find((s) => s.valore === stato)?.etichetta ?? 'Scegli lo stato'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATI.map((s) => (
                    <SelectItem key={s.valore} value={s.valore}>
                      {s.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Valido fino al" hint="Vuoto vuol dire senza scadenza.">
            {(props) => (
              <Input
                {...props}
                type="date"
                value={scadenza}
                onChange={(evento) => setScadenza(evento.target.value)}
              />
            )}
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAbbonamento(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button onClick={salvaAbbonamento} disabled={piano === '' || inCorso}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (sospesa) {
    return (
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setAbbonamento(true)} disabled={inCorso}>
          <CreditCard aria-hidden="true" />
          Abbonamento
        </Button>
        <Button variant="secondary" size="sm" onClick={riattiva} disabled={inCorso}>
          <PlayCircle aria-hidden="true" />
          Riattiva
        </Button>
        {dialogoAbbonamento}
      </div>
    )
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => setAbbonamento(true)} disabled={inCorso}>
        <CreditCard aria-hidden="true" />
        Abbonamento
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAperto(true)} disabled={inCorso}>
        <PauseCircle aria-hidden="true" />
        Sospendi
      </Button>
      {dialogoAbbonamento}

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
    </div>
  )
}
