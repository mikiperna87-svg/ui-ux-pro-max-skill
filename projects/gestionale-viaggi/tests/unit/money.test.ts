import { describe, expect, it } from 'vitest'
import {
  applyRateBps,
  centsToInputValue,
  formatEuro,
  formatPercent,
  MoneyError,
  netFromGross,
  parseAmountToCents,
  ratioBps,
  splitByWeights,
  splitEvenly,
  sumCents,
  vatFromGross,
  vatFromNet,
} from '@/lib/money'

/**
 * Intl separa l'importo dal simbolo con uno spazio unificatore (U+00A0), che e'
 * la resa tipografica corretta: qui lo normalizziamo per leggibilita' dei test.
 */
const euro = (value: string) => value.replace(/\u00a0/g, ' ')

describe('formatEuro', () => {
  it('formatta i centesimi secondo la convenzione italiana', () => {
    expect(euro(formatEuro(123_456))).toBe('1.234,56 €')
    expect(euro(formatEuro(0))).toBe('0,00 €')
    expect(euro(formatEuro(-5000))).toBe('-50,00 €')
  })

  it('mostra il segno quando richiesto', () => {
    expect(euro(formatEuro(2500, { signed: true }))).toBe('+25,00 €')
    expect(euro(formatEuro(-2500, { signed: true }))).toBe('-25,00 €')
  })

  it('rifiuta importi non interi, perche significherebbero centesimi persi', () => {
    expect(() => formatEuro(12.5)).toThrow(MoneyError)
  })
})

describe('parseAmountToCents', () => {
  it('accetta i formati che un operatore digita davvero', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123_456)
    expect(parseAmountToCents('1234,56')).toBe(123_456)
    expect(parseAmountToCents('1234.56')).toBe(123_456)
    expect(parseAmountToCents('€ 1.234,56')).toBe(123_456)
    expect(parseAmountToCents('890')).toBe(89_000)
    expect(parseAmountToCents('-45,50')).toBe(-4550)
  })

  it('non perde precisione dove il float sbaglierebbe', () => {
    // 0,1 + 0,2 in virgola mobile darebbe 0,30000000000000004
    expect(parseAmountToCents('0,1') + parseAmountToCents('0,2')).toBe(30)
    expect(parseAmountToCents('1234567890,12')).toBe(123_456_789_012)
  })

  it('rifiuta formati ambigui invece di indovinare', () => {
    expect(() => parseAmountToCents('12,345')).toThrow(MoneyError)
    expect(() => parseAmountToCents('abc')).toThrow(MoneyError)
    expect(() => parseAmountToCents('')).toThrow(MoneyError)
  })
})

describe('IVA', () => {
  it('calcola l IVA sull imponibile', () => {
    expect(vatFromNet(100_000, 2200)).toBe(22_000)
    expect(vatFromNet(9999, 2200)).toBe(2200) // 2199,78 -> 2200
  })

  it('scorpora l IVA dal lordo', () => {
    expect(netFromGross(122_000, 2200)).toBe(100_000)
    expect(vatFromGross(122_000, 2200)).toBe(22_000)
  })

  it('lordo e imponibile + IVA restano coerenti al centesimo', () => {
    for (const gross of [1, 99, 1234, 56_789, 999_999]) {
      expect(netFromGross(gross, 2200) + vatFromGross(gross, 2200)).toBe(gross)
    }
  })

  it('arrotonda a metà per eccesso, come in fattura', () => {
    // 50 centesimi al 10% = 5 esatti; 55 al 10% = 5,5 -> 6
    expect(applyRateBps(50, 1000)).toBe(5)
    expect(applyRateBps(55, 1000)).toBe(6)
    expect(applyRateBps(-55, 1000)).toBe(-6)
  })
})

describe('ripartizioni', () => {
  it('divide senza perdere centesimi', () => {
    const parts = splitEvenly(100_00, 3)
    expect(parts).toEqual([3334, 3333, 3333])
    expect(sumCents(parts)).toBe(100_00)
  })

  it('divide per pesi senza perdere centesimi', () => {
    const parts = splitByWeights(100_000, [30, 70])
    expect(sumCents(parts)).toBe(100_000)
    expect(parts).toEqual([30_000, 70_000])
  })

  it('assorbe il resto anche con pesi scomodi', () => {
    const parts = splitByWeights(10_000, [1, 1, 1])
    expect(sumCents(parts)).toBe(10_000)
  })
})

describe('percentuali', () => {
  it('calcola il rapporto in punti base', () => {
    expect(ratioBps(1500, 10_000)).toBe(1500)
    expect(ratioBps(0, 0)).toBe(0)
  })

  it('formatta la percentuale in italiano', () => {
    expect(formatPercent(1875)).toBe('18,75%')
    expect(formatPercent(1000, 0)).toBe('10%')
  })
})

describe('centsToInputValue', () => {
  it('produce il valore da mettere in un campo di testo', () => {
    expect(centsToInputValue(123_456)).toBe('1234,56')
    expect(centsToInputValue(5)).toBe('0,05')
    expect(centsToInputValue(-5)).toBe('-0,05')
  })
})
