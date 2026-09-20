import { describe, expect, it } from 'vitest'
import {
  daysFromToday,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatDateTime,
  formatRelativeDays,
  parseItalianDate,
  toDateInput,
  toIsoDateOnly,
} from '@/lib/date'

describe('formattazione delle date', () => {
  it('rende una data ISO nel formato italiano', () => {
    expect(formatDateShort('2026-03-14')).toBe('14/03/2026')
    expect(formatDateLong('2026-03-14')).toBe('14 marzo 2026')
  })

  it('mostra un trattino quando la data manca', () => {
    expect(formatDateShort(null)).toBe('—')
    expect(formatDateShort(undefined)).toBe('—')
    expect(formatDateShort('')).toBe('—')
    expect(formatDateTime(null)).toBe('—')
  })

  it('converte gli istanti UTC nel fuso di Roma', () => {
    // 22:30 UTC del 13 marzo sono le 23:30 del 13 marzo a Roma (CET, +1)
    expect(formatDateTime('2026-03-13T22:30:00Z')).toBe('13/03/2026 23:30')
    // In estate (CEST, +2) le 23:30 UTC diventano le 01:30 del giorno dopo
    expect(formatDateTime('2026-07-13T23:30:00Z')).toBe('14/07/2026 01:30')
  })

  it('comprime gli intervalli leggibili', () => {
    expect(formatDateRange('2026-03-14', '2026-03-21')).toBe('14 – 21 mar 2026')
    expect(formatDateRange('2026-02-28', '2026-03-03')).toBe('28 feb – 3 mar 2026')
    expect(formatDateRange('2026-12-28', '2027-01-03')).toBe('28 dic 2026 – 3 gen 2027')
    expect(formatDateRange(null, null)).toBe('—')
  })

  it('descrive la distanza in giorni in italiano', () => {
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86_400_000)
    const inFiveDays = new Date(today.getTime() + 5 * 86_400_000)
    const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000)

    expect(formatRelativeDays(today)).toBe('oggi')
    expect(formatRelativeDays(tomorrow)).toBe('domani')
    expect(formatRelativeDays(inFiveDays)).toBe('fra 5 giorni')
    expect(formatRelativeDays(twoDaysAgo)).toBe('2 giorni fa')
  })

  it('calcola i giorni rispetto a oggi', () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000)
    expect(daysFromToday(inTenDays)).toBe(10)
  })
})

describe('lettura delle date inserite a mano', () => {
  it('accetta il formato gg/mm/aaaa', () => {
    const parsed = parseItalianDate('14/03/2026')
    expect(parsed).not.toBeNull()
    expect(toIsoDateOnly(parsed as Date)).toBe('2026-03-14')
  })

  it('rifiuta le date impossibili', () => {
    expect(parseItalianDate('32/13/2026')).toBeNull()
    expect(parseItalianDate('non una data')).toBeNull()
  })
})

describe('valore per un campo data', () => {
  it('accetta la forma AAAA-MM-GG e taglia un istante ISO completo', () => {
    expect(toDateInput('2026-09-20')).toBe('2026-09-20')
    // È la forma che il driver Postgres produce per una colonna `date`: un
    // campo <input type="date"> la rifiuterebbe restando vuoto.
    expect(toDateInput('2026-09-20T00:00:00.000Z')).toBe('2026-09-20')
  })

  it('su un valore assente o incomprensibile restituisce la stringa vuota', () => {
    expect(toDateInput(null)).toBe('')
    expect(toDateInput(undefined)).toBe('')
    expect(toDateInput('')).toBe('')
    expect(toDateInput('20/09/2026')).toBe('')
  })
})
