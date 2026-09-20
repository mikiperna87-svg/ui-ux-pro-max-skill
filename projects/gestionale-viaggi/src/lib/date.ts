import { TZDate } from '@date-fns/tz'
import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  subDays,
} from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * Sul database tutto e' UTC (timestamptz) oppure una data pura (date).
 * In interfaccia tutto si legge nel fuso dell’agenzia.
 */
export const APP_TIME_ZONE = 'Europe/Rome'

export type DateInput = Date | string | number

/** Converte qualunque input in un istante interpretato nel fuso di Roma. */
export function toRome(value: DateInput): TZDate {
  const date = value instanceof Date ? value : new Date(value)
  return new TZDate(date, APP_TIME_ZONE)
}

/** Data odierna a Roma, azzerata a mezzanotte. */
export function todayInRome(): TZDate {
  return startOfDay(new TZDate(new Date(), APP_TIME_ZONE)) as TZDate
}

/** "2026-03-14" -> etichetta "14/03/2026". */
export function formatDateShort(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = toRome(value)
  return isValid(date) ? format(date, 'dd/MM/yyyy', { locale: it }) : '—'
}

/** "2026-03-14" -> "14 marzo 2026". */
export function formatDateLong(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = toRome(value)
  return isValid(date) ? format(date, 'd MMMM yyyy', { locale: it }) : '—'
}

/** "14/03/2026 09:35". */
export function formatDateTime(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = toRome(value)
  return isValid(date) ? format(date, 'dd/MM/yyyy HH:mm', { locale: it }) : '—'
}

/** Etichetta compatta per intervalli: "14 – 21 mar 2026" oppure "28 feb – 3 mar 2026". */
export function formatDateRange(
  from: DateInput | null | undefined,
  to: DateInput | null | undefined,
): string {
  if (!from && !to) return '—'
  if (!from) return formatDateShort(to)
  if (!to) return formatDateShort(from)
  const start = toRome(from)
  const end = toRome(to)
  const sameYear = format(start, 'yyyy') === format(end, 'yyyy')
  const sameMonth = sameYear && format(start, 'MM') === format(end, 'MM')
  if (sameMonth) {
    return `${format(start, 'd', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`
  }
  if (sameYear) {
    return `${format(start, 'd MMM', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`
  }
  return `${format(start, 'd MMM yyyy', { locale: it })} – ${format(end, 'd MMM yyyy', { locale: it })}`
}

/** Distanza in giorni di calendario rispetto a oggi (positiva = nel futuro). */
export function daysFromToday(value: DateInput): number {
  return differenceInCalendarDays(toRome(value), todayInRome())
}

/** Etichetta relativa in italiano: "oggi", "fra 3 giorni", "12 giorni fa". */
export function formatRelativeDays(value: DateInput | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const days = daysFromToday(value)
  if (days === 0) return 'oggi'
  if (days === 1) return 'domani'
  if (days === -1) return 'ieri'
  if (days > 0) return `fra ${days} giorni`
  return `${Math.abs(days)} giorni fa`
}

/** Data pura in formato ISO (yyyy-MM-dd), il formato usato dalle colonne `date`. */

/**
 * Il valore da dare a un campo `<input type="date">`.
 *
 * Il campo accetta soltanto la forma "AAAA-MM-GG": qualunque altra cosa — un
 * istante ISO completo, per esempio — lo lascia vuoto senza dire niente, e chi
 * compila il modulo si ritrova un campo obbligatorio in bianco. Qui si taglia
 * a quella forma tutto ciò che la contiene.
 */
export function toDateInput(value: string | null | undefined): string {
  if (!value) return ''
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ''
}

export function toIsoDateOnly(value: DateInput): string {
  return format(toRome(value), 'yyyy-MM-dd')
}

/** Converte "14/03/2026" in una data valida, oppure null. */
export function parseItalianDate(input: string): Date | null {
  const parsed = parse(input, 'dd/MM/yyyy', new TZDate(new Date(), APP_TIME_ZONE))
  return isValid(parsed) ? parsed : null
}

/** Intervallo [inizio, fine] del mese corrente a Roma, in ISO UTC. */
export function currentMonthRange(): { from: string; to: string } {
  const now = new TZDate(new Date(), APP_TIME_ZONE)
  return {
    from: startOfMonth(now).toISOString(),
    to: endOfMonth(now).toISOString(),
  }
}

/** Intervallo che copre gli ultimi `days` giorni, estremi inclusi. */
export function lastDaysRange(days: number): { from: string; to: string } {
  const now = new TZDate(new Date(), APP_TIME_ZONE)
  return {
    from: startOfDay(subDays(now, days - 1)).toISOString(),
    to: endOfDay(now).toISOString(),
  }
}

/** Intervallo che copre i prossimi `days` giorni, estremi inclusi. */
export function nextDaysRange(days: number): { from: string; to: string } {
  const now = new TZDate(new Date(), APP_TIME_ZONE)
  return {
    from: startOfDay(now).toISOString(),
    to: endOfDay(addDays(now, days)).toISOString(),
  }
}

export { addDays, differenceInCalendarDays, endOfDay, startOfDay }
