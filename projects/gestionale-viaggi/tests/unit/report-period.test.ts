import { TZDate } from '@date-fns/tz'
import { describe, expect, it } from 'vitest'
import {
  MESI_MASSIMI,
  dataValida,
  durataGiorni,
  durataMesi,
  isPresetPeriodo,
  periodoPrecedente,
  risolviPeriodo,
  variazioneBps,
} from '@/lib/report-period'

/**
 * Il periodo dei report è calcolo puro: se sbaglia, sbagliano tutti i numeri
 * della pagina senza che nulla vada in errore. Per questo si verifica qui,
 * con una data di riferimento fissa, invece che guardando lo schermo.
 */
const OGGI = new TZDate('2026-05-20T10:00:00', 'Europe/Rome')

describe('risolviPeriodo', () => {
  it('l’anno corrente è il periodo predefinito', () => {
    expect(risolviPeriodo({}, OGGI)).toEqual({
      chiave: 'anno',
      from: '2026-01-01',
      to: '2026-12-31',
      troncato: false,
    })
  })

  it('riconosce i preset', () => {
    expect(risolviPeriodo({ periodo: 'mese' }, OGGI)).toMatchObject({
      from: '2026-05-01',
      to: '2026-05-31',
    })
    expect(risolviPeriodo({ periodo: 'trimestre' }, OGGI)).toMatchObject({
      from: '2026-04-01',
      to: '2026-06-30',
    })
    expect(risolviPeriodo({ periodo: 'dodici' }, OGGI)).toMatchObject({
      from: '2025-06-01',
      to: '2026-05-31',
    })
    expect(risolviPeriodo({ periodo: 'scorso' }, OGGI)).toMatchObject({
      from: '2025-01-01',
      to: '2025-12-31',
    })
  })

  it('le date scritte a mano vincono sul preset', () => {
    const periodo = risolviPeriodo({ periodo: 'mese', da: '2026-02-01', a: '2026-03-15' }, OGGI)
    expect(periodo).toEqual({
      chiave: 'personalizzato',
      from: '2026-02-01',
      to: '2026-03-15',
      troncato: false,
    })
  })

  it('un indirizzo manomesso non arriva al database', () => {
    // Data inesistente, intervallo rovesciato, preset inventato: in tutti e tre
    // i casi si torna al periodo predefinito invece di interrogare il database
    // con valori arbitrari.
    expect(risolviPeriodo({ da: '2026-02-31', a: '2026-03-01' }, OGGI).chiave).toBe('anno')
    expect(risolviPeriodo({ da: '2026-06-01', a: '2026-01-01' }, OGGI).chiave).toBe('anno')
    expect(risolviPeriodo({ periodo: 'sempre' }, OGGI).chiave).toBe('anno')
    expect(risolviPeriodo({ da: 'ieri', a: 'domani' }, OGGI).chiave).toBe('anno')
  })

  it('un periodo troppo lungo viene ridotto e lo dichiara', () => {
    const periodo = risolviPeriodo({ da: '2020-01-01', a: '2026-12-31' }, OGGI)
    expect(periodo.troncato).toBe(true)
    expect(periodo.from).toBe('2020-01-01')
    expect(periodo.to).toBe('2021-12-31')
    expect(durataMesi(periodo.from, periodo.to)).toBe(MESI_MASSIMI)
  })

  it('accetta più valori per lo stesso parametro prendendo il primo', () => {
    expect(risolviPeriodo({ periodo: ['mese', 'anno'] }, OGGI)).toMatchObject({ from: '2026-05-01' })
  })
})

describe('dataValida', () => {
  it('accetta solo date pure esistenti', () => {
    expect(dataValida('2026-03-14')).toBe('2026-03-14')
    expect(dataValida('2024-02-29')).toBe('2024-02-29')
    expect(dataValida('2026-02-30')).toBeNull()
    expect(dataValida('2026-13-01')).toBeNull()
    expect(dataValida('14/03/2026')).toBeNull()
    expect(dataValida(undefined)).toBeNull()
  })
})

describe('periodoPrecedente', () => {
  it('ha la stessa durata e finisce il giorno prima', () => {
    const precedente = periodoPrecedente('2026-01-01', '2026-12-31')
    expect(precedente).toEqual({ from: '2025-01-01', to: '2025-12-31' })
    expect(durataGiorni('2026-01-01', '2026-12-31')).toBe(durataGiorni(precedente.from, precedente.to))
  })

  it('confronta febbraio con un periodo di pari lunghezza, non col mese prima', () => {
    // Febbraio dura 28 giorni: il termine di paragone ne deve durare 28, non 31,
    // altrimenti il mese corto sembrerebbe sempre debole.
    const precedente = periodoPrecedente('2026-02-01', '2026-02-28')
    expect(precedente).toEqual({ from: '2026-01-04', to: '2026-01-31' })
    expect(durataGiorni(precedente.from, precedente.to)).toBe(28)
  })

  it('funziona anche su un solo giorno', () => {
    expect(periodoPrecedente('2026-03-01', '2026-03-01')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    })
  })
})

describe('variazioneBps', () => {
  it('misura la differenza relativa in punti base', () => {
    expect(variazioneBps(150, 100)).toBe(5000)
    expect(variazioneBps(50, 100)).toBe(-5000)
    expect(variazioneBps(100, 100)).toBe(0)
  })

  it('senza termine di paragone non inventa una percentuale', () => {
    expect(variazioneBps(50_000, 0)).toBeNull()
    expect(variazioneBps(0, 0)).toBeNull()
  })

  it('con un valore precedente negativo usa il modulo', () => {
    // Un margine passato da -1.000 a +1.000 è migliorato del 200 %, non
    // peggiorato: il segno del denominatore non deve ribaltare il verso.
    expect(variazioneBps(1000, -1000)).toBe(20_000)
  })
})

describe('durate', () => {
  it('conta i mesi e i giorni compresi gli estremi', () => {
    expect(durataMesi('2026-01-01', '2026-01-31')).toBe(1)
    expect(durataMesi('2026-01-15', '2026-03-02')).toBe(3)
    expect(durataGiorni('2026-01-01', '2026-01-01')).toBe(1)
    expect(durataGiorni('2026-01-01', '2026-12-31')).toBe(365)
  })

  it('riconosce i preset ammessi', () => {
    expect(isPresetPeriodo('mese')).toBe(true)
    expect(isPresetPeriodo('decennio')).toBe(false)
    expect(isPresetPeriodo(null)).toBe(false)
  })
})
