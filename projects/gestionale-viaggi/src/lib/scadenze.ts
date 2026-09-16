import type { Cents } from '@/lib/money'
import { formatEuro } from '@/lib/money'

export type StatoRata = 'saldata' | 'parziale' | 'scaduta' | 'attesa'

export interface RataDaCoprire {
  readonly due_date: string
  readonly amount_cents: Cents
}

export interface CoperturaRata {
  readonly stato: StatoRata
  /** Quanto degli incassi è stato attribuito a questa rata. */
  readonly coperto: Cents
  readonly label: string
  readonly tone: 'success' | 'info' | 'danger' | 'neutral'
}

/**
 * Attribuisce gli incassi alle scadenze, in ordine di data.
 *
 * È quello che farebbe chiunque riconciliando a mano: il primo denaro entrato
 * copre la prima scadenza, il resto scende alla successiva. Senza questa
 * attribuzione una rata già pagata resterebbe scritta "da incassare" accanto
 * al suo stesso incasso, e nessuno si fiderebbe più della colonna.
 *
 * Non tocca il database: lo stato di pagamento della pratica resta quello
 * calcolato dalla vista `booking_financials`. Qui si spiega soltanto *dove*
 * sono finiti i soldi già incassati.
 */
export function attribuisciIncassi(
  incassato: Cents,
  rate: readonly RataDaCoprire[],
  oggi: string = new Date().toISOString().slice(0, 10),
): readonly CoperturaRata[] {
  let residuo = Math.max(0, incassato)

  return rate.map((rata) => {
    const coperto = Math.min(residuo, Math.max(0, rata.amount_cents))
    residuo -= coperto

    if (coperto >= rata.amount_cents && rata.amount_cents > 0) {
      return { stato: 'saldata', coperto, label: 'Saldata', tone: 'success' }
    }
    if (coperto > 0) {
      return {
        stato: 'parziale',
        coperto,
        label: `Parziale ${formatEuro(coperto)}`,
        tone: 'info',
      }
    }
    if (rata.due_date < oggi) {
      return { stato: 'scaduta', coperto, label: 'Scaduta', tone: 'danger' }
    }
    return { stato: 'attesa', coperto, label: 'Da incassare', tone: 'neutral' }
  })
}
