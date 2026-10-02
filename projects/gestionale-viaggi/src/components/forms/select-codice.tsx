'use client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Voce } from '@/lib/sdi/codici'

/**
 * Un menù di codici fiscali — regime, natura, modalità di pagamento.
 *
 * Il menù di Radix non partecipa all'invio del modulo: il valore viaggia in un
 * campo nascosto accanto. È la stessa struttura che usano gli altri moduli del
 * gestionale, raccolta qui perché di questi menù ne servono quattro e quattro
 * copie della stessa cosa divergono al primo ritocco.
 *
 * L'etichetta mostra sempre il codice davanti alla descrizione: chi compila
 * una fattura il codice lo cerca, e «RF01» si trova prima di «Ordinario».
 */
export function SelectCodice({
  id,
  name,
  voci,
  defaultValue,
  vuoto,
  onChange,
}: {
  id?: string
  name: string
  voci: readonly Voce[]
  defaultValue?: string | null
  /** Etichetta della voce «nessuno». Se assente, la scelta è obbligatoria. */
  vuoto?: string
  onChange?: (valore: string) => void
}) {
  const [valore, setValore] = useState(defaultValue ?? '')
  const scelta = voci.find((v) => v.codice === valore)

  return (
    <>
      <input type="hidden" name={name} value={valore} />
      <Select
        value={valore}
        onValueChange={(nuovo) => {
          const pulito = nuovo === '—' ? '' : nuovo
          setValore(pulito)
          onChange?.(pulito)
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue>
            {scelta ? `${scelta.codice} · ${scelta.etichetta}` : (vuoto ?? 'Scegli')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {vuoto ? <SelectItem value="—">{vuoto}</SelectItem> : null}
          {voci.map((voce) => (
            <SelectItem key={voce.codice} value={voce.codice}>
              {voce.codice} · {voce.etichetta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
