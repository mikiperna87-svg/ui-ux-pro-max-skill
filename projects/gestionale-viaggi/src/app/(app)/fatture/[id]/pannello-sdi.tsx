'use client'

import { AlertTriangle, CheckCircle2, Download, FileCog, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import type { Enums } from '@/lib/database.types'
import { formatDateTime } from '@/lib/date'
import type { Rilievo } from '@/lib/sdi/validazione'
import { preparaXmlAction, registraEsitoSdiAction } from '@/server/actions/sdi'

/**
 * Lo stato della fattura presso il Sistema di Interscambio.
 *
 * Ogni stato porta colore *e* parola: un pallino verde da solo non dice
 * niente a chi non distingue i colori, e su un documento fiscale la differenza
 * fra «consegnata» e «scartata» non può stare in una sfumatura.
 */
const STATI: Record<
  Enums['sdi_status'],
  { etichetta: string; tono: 'neutro' | 'attesa' | 'buono' | 'attenzione' | 'grave'; spiegazione: string }
> = {
  non_inviata: {
    etichetta: 'Da preparare',
    tono: 'neutro',
    spiegazione: 'Il file non è ancora stato prodotto.',
  },
  generata: {
    etichetta: 'File pronto',
    tono: 'attesa',
    spiegazione: 'Il file è pronto da scaricare e consegnare all’intermediario.',
  },
  inviata: {
    etichetta: 'Inviata',
    tono: 'attesa',
    spiegazione: 'Consegnata all’intermediario, in attesa dell’esito dal Sistema di Interscambio.',
  },
  consegnata: {
    etichetta: 'Consegnata',
    tono: 'buono',
    spiegazione: 'Il Sistema di Interscambio l’ha recapitata al destinatario.',
  },
  mancata_consegna: {
    etichetta: 'Non consegnata',
    tono: 'attenzione',
    spiegazione:
      'Accettata ma non recapitata: resta valida ed è disponibile nel cassetto fiscale del cliente.',
  },
  scartata: {
    etichetta: 'Scartata',
    tono: 'grave',
    spiegazione: 'Il Sistema di Interscambio l’ha rifiutata: va corretta e ritrasmessa.',
  },
}

const TONO: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  neutro: 'neutral',
  attesa: 'info',
  buono: 'success',
  attenzione: 'warning',
  grave: 'danger',
}

const ESITI: readonly { valore: Enums['sdi_status']; etichetta: string }[] = [
  { valore: 'inviata', etichetta: 'Consegnata all’intermediario' },
  { valore: 'consegnata', etichetta: 'Consegnata dal Sistema di Interscambio' },
  { valore: 'mancata_consegna', etichetta: 'Accettata ma non recapitata' },
  { valore: 'scartata', etichetta: 'Scartata dal Sistema di Interscambio' },
]

function ElencoRilievi({ rilievi, grave }: { rilievi: readonly Rilievo[]; grave: boolean }) {
  if (rilievi.length === 0) return null
  return (
    <ul className="space-y-2">
      {rilievi.map((rilievo, indice) => (
        <li key={indice} className="flex gap-2 text-small">
          {grave ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="text-text">{rilievo.messaggio}</span>{' '}
            <span className="text-text-subtle">— {rilievo.dove}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PannelloSdi({
  invoiceId,
  stato,
  progressivo,
  filename,
  inviataIl,
  messaggio,
  bloccanti,
  avvisi,
  canWrite,
}: {
  invoiceId: string
  stato: Enums['sdi_status']
  progressivo: string | null
  filename: string | null
  inviataIl: string | null
  messaggio: string | null
  bloccanti: readonly Rilievo[]
  avvisi: readonly Rilievo[]
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [inCorso, startTransition] = useTransition()
  const [esito, setEsito] = useState<string>('')
  const [nota, setNota] = useState('')

  const descrizione = STATI[stato]
  const pronta = bloccanti.length === 0

  function prepara() {
    startTransition(async () => {
      const risultato = await preparaXmlAction(invoiceId)
      if (risultato.status === 'success') {
        toast.success(risultato.message ?? 'File pronto.')
        router.refresh()
      } else {
        toast.error(risultato.message ?? 'Non siamo riusciti a preparare il file.')
      }
    })
  }

  function registra() {
    if (esito === '') return
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', invoiceId)
      formData.set('stato', esito)
      if (nota.trim() !== '') formData.set('messaggio', nota.trim())
      const risultato = await registraEsitoSdiAction({ status: 'idle' }, formData)
      if (risultato.status === 'success') {
        toast.success(risultato.message ?? 'Esito registrato.')
        setEsito('')
        setNota('')
        router.refresh()
      } else {
        toast.error(risultato.message ?? 'Non siamo riusciti a registrare l’esito.')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Fattura elettronica</CardTitle>
        <Badge tone={TONO[descrizione.tono]} dot>
          {descrizione.etichetta}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-small text-text-muted">{descrizione.spiegazione}</p>

        {messaggio ? (
          <p className="rounded-md bg-surface-2 p-3 text-small text-text">{messaggio}</p>
        ) : null}

        {bloccanti.length > 0 ? (
          <div className="space-y-2">
            <p className="text-small font-semibold text-text">
              Da sistemare prima di trasmettere
            </p>
            <ElencoRilievi rilievi={bloccanti} grave />
          </div>
        ) : null}

        {avvisi.length > 0 ? (
          <div className="space-y-2">
            <p className="text-small font-semibold text-text">Da sapere</p>
            <ElencoRilievi rilievi={avvisi} grave={false} />
          </div>
        ) : null}

        {pronta && bloccanti.length === 0 && avvisi.length === 0 ? (
          <p className="flex items-center gap-2 text-small text-text">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            Il documento ha tutto quello che serve per essere trasmesso.
          </p>
        ) : null}

        {progressivo ? (
          <dl className="grid gap-1 text-small">
            <div className="flex gap-2">
              <dt className="text-text-subtle">Nome del file</dt>
              <dd className="min-w-0 break-all font-mono text-text">{filename}</dd>
            </div>
            {inviataIl ? (
              <div className="flex gap-2">
                <dt className="text-text-subtle">Inviata il</dt>
                <dd className="text-text">{formatDateTime(inviataIl)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={prepara}
              disabled={!pronta || inCorso}
            >
              <FileCog aria-hidden="true" />
              {progressivo ? 'Rigenera il file' : 'Prepara il file'}
            </Button>
            {progressivo ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/fatture/${invoiceId}/xml`}>
                  <Download aria-hidden="true" />
                  Scarica XML
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {canWrite && progressivo ? (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-small font-semibold text-text">Registra l’esito</p>
            <p className="text-small text-text-muted">
              L’esito arriva dal portale dell’intermediario o per email: annotandolo qui, la
              cronologia della fattura resta completa.
            </p>
            <Field label="Che cosa è successo">
              {(props) => (
                <Select value={esito} onValueChange={setEsito}>
                  <SelectTrigger id={props.id}>
                    <SelectValue>
                      {ESITI.find((e) => e.valore === esito)?.etichetta ?? 'Scegli l’esito'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ESITI.map((e) => (
                      <SelectItem key={e.valore} value={e.valore}>
                        {e.etichetta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Nota" hint="Per esempio il codice dello scarto, se c’è stato.">
              {(props) => (
                <Textarea
                  {...props}
                  rows={2}
                  value={nota}
                  onChange={(evento) => setNota(evento.target.value)}
                />
              )}
            </Field>
            <Button
              type="button"
              size="sm"
              onClick={registra}
              disabled={esito === '' || inCorso}
            >
              Registra
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
