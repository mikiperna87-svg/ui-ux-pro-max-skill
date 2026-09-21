import { TZDate } from '@date-fns/tz'
import {
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  isValid,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subYears,
} from 'date-fns'
import { APP_TIME_ZONE, toIsoDateOnly, todayInRome } from '@/lib/date'

/**
 * Il periodo dei report.
 *
 * Tutto qui dentro è calcolo puro su date pure: entra ciò che sta
 * nell'indirizzo, esce un intervallo di due date ISO. Nessuna query, nessun
 * fuso diverso da quello dell'agenzia, così il periodo si può verificare con
 * un test invece che con uno sguardo alla pagina.
 */

export const PRESET_PERIODI = ['mese', 'trimestre', 'anno', 'dodici', 'scorso'] as const
export type PresetPeriodo = (typeof PRESET_PERIODI)[number]

export const ETICHETTE_PERIODO: Record<PresetPeriodo, string> = {
  mese: 'Mese corrente',
  trimestre: 'Trimestre',
  anno: 'Anno corrente',
  dodici: 'Ultimi 12 mesi',
  scorso: 'Anno scorso',
}

/** Oltre due anni il grafico mensile diventa illeggibile e la query pesante. */
export const MESI_MASSIMI = 24

export interface Periodo {
  /** Preset scelto, oppure 'personalizzato' quando le date arrivano a mano. */
  readonly chiave: PresetPeriodo | 'personalizzato'
  readonly from: string
  readonly to: string
  /** Vero quando l'intervallo chiesto superava il massimo ed è stato ridotto. */
  readonly troncato: boolean
}

export function isPresetPeriodo(value: unknown): value is PresetPeriodo {
  return typeof value === 'string' && (PRESET_PERIODI as readonly string[]).includes(value)
}

function primo(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Una data pura valida, oppure null: "2026-13-40" non deve arrivare al database. */
export function dataValida(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new TZDate(`${value}T00:00:00`, APP_TIME_ZONE)
  if (!isValid(date)) return null
  // "2026-02-31" supera l'espressione regolare ma non esiste: Date lo sposta al
  // primo marzo, e il confronto con il testo originale lo smaschera.
  return toIsoDateOnly(date) === value ? value : null
}

function intervalloPreset(preset: PresetPeriodo, oggi: TZDate): { from: Date; to: Date } {
  switch (preset) {
    case 'mese':
      return { from: startOfMonth(oggi), to: endOfMonth(oggi) }
    case 'trimestre':
      return { from: startOfQuarter(oggi), to: endOfQuarter(oggi) }
    case 'dodici':
      return { from: startOfMonth(addMonths(oggi, -11)), to: endOfMonth(oggi) }
    case 'scorso': {
      const scorso = subYears(oggi, 1)
      return { from: startOfYear(scorso), to: endOfYear(scorso) }
    }
    case 'anno':
    default:
      return { from: startOfYear(oggi), to: endOfYear(oggi) }
  }
}

/**
 * Risolve i parametri dell'indirizzo in un periodo utilizzabile.
 *
 * Le date scritte a mano hanno la precedenza sul preset — sono più specifiche —
 * ma solo se sono due date vere e in ordine. Qualunque cosa non lo sia torna
 * al preset, che è sempre un periodo sensato: meglio un report dell'anno in
 * corso che una pagina d'errore per una virgola nell'indirizzo.
 */
export function risolviPeriodo(
  params: Record<string, string | string[] | undefined>,
  oggi: TZDate = todayInRome(),
): Periodo {
  const da = dataValida(primo(params.da))
  const a = dataValida(primo(params.a))

  if (da && a && da <= a) {
    return limita({ chiave: 'personalizzato', from: da, to: a, troncato: false })
  }

  const chiave = isPresetPeriodo(primo(params.periodo)) ? (primo(params.periodo) as PresetPeriodo) : 'anno'
  const intervallo = intervalloPreset(chiave, oggi)
  return {
    chiave,
    from: toIsoDateOnly(intervallo.from),
    to: toIsoDateOnly(intervallo.to),
    troncato: false,
  }
}

/** Riduce al massimo consentito un intervallo troppo lungo, dicendolo. */
function limita(periodo: Periodo): Periodo {
  if (durataMesi(periodo.from, periodo.to) <= MESI_MASSIMI) return periodo
  const inizio = new TZDate(`${periodo.from}T00:00:00`, APP_TIME_ZONE)
  const fine = subDays(addMonths(inizio, MESI_MASSIMI), 1)
  return { ...periodo, to: toIsoDateOnly(fine), troncato: true }
}

/** Mesi di calendario coperti dall'intervallo, estremi inclusi. */
export function durataMesi(from: string, to: string): number {
  const inizio = new TZDate(`${from}T00:00:00`, APP_TIME_ZONE)
  const fine = new TZDate(`${to}T00:00:00`, APP_TIME_ZONE)
  return differenceInCalendarMonths(fine, inizio) + 1
}

/** Giorni coperti dall'intervallo, estremi inclusi. */
export function durataGiorni(from: string, to: string): number {
  const inizio = Date.parse(`${from}T00:00:00Z`)
  const fine = Date.parse(`${to}T00:00:00Z`)
  return Math.round((fine - inizio) / 86_400_000) + 1
}

/**
 * Il periodo immediatamente precedente, della stessa durata.
 *
 * Confrontare gennaio con dicembre ha senso solo se i due intervalli durano
 * uguale: un mese di 28 giorni contro uno di 31 farebbe sembrare febbraio un
 * mese debole anche quando non lo è. Qui la lunghezza è identica per
 * costruzione, e il confronto resta onesto.
 */
export function periodoPrecedente(from: string, to: string): { from: string; to: string } {
  const giorni = durataGiorni(from, to)
  const inizio = new TZDate(`${from}T00:00:00`, APP_TIME_ZONE)
  const fine = subDays(inizio, 1)
  const partenza = subDays(fine, giorni - 1)
  return { from: toIsoDateOnly(partenza), to: toIsoDateOnly(fine) }
}

/**
 * Variazione fra due valori, in punti base.
 *
 * Restituisce null quando il termine di paragone è zero: passare da 0 a 50.000
 * euro non è "+100%", è un confronto che non si può fare, e mostrare una
 * percentuale inventata sarebbe peggio che non mostrarla.
 */
export function variazioneBps(attuale: number, precedente: number): number | null {
  if (precedente === 0) return null
  return Math.round(((attuale - precedente) / Math.abs(precedente)) * 10_000)
}
