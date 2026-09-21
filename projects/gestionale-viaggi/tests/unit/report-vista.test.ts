import { describe, expect, it } from 'vitest'
import {
  ETICHETTE_VISTA,
  VISTE,
  isVista,
  linkEsporta,
  linkVista,
  vistaDa,
  visteVisibili,
} from '@/app/(app)/report/config'
import type { Periodo } from '@/lib/report-period'

const PRESET: Periodo = { chiave: 'anno', from: '2026-01-01', to: '2026-12-31', troncato: false }
const SU_MISURA: Periodo = {
  chiave: 'personalizzato',
  from: '2026-03-01',
  to: '2026-06-30',
  troncato: false,
}

describe('viste del report', () => {
  it('ogni vista ha la sua etichetta', () => {
    for (const vista of VISTE) {
      expect(ETICHETTE_VISTA[vista]).toBeTruthy()
    }
  })

  it('una vista inventata nell’indirizzo torna agli operatori', () => {
    expect(vistaDa('margini-segreti', true)).toBe('operatori')
    expect(vistaDa(undefined, true)).toBe('operatori')
    expect(vistaDa(['destinazioni', 'fornitori'], true)).toBe('destinazioni')
  })

  it('chi non vede i margini non raggiunge i fornitori', () => {
    // Il report dei fornitori è una lettura di costi: il ricarico si
    // ricaverebbe per differenza, quindi il permesso deve valere anche qui e
    // non solo sulle colonne.
    expect(vistaDa('fornitori', false)).toBe('operatori')
    expect(vistaDa('fornitori', true)).toBe('fornitori')
    expect(visteVisibili(false)).toEqual(['operatori', 'destinazioni'])
    expect(visteVisibili(true)).toEqual(['operatori', 'destinazioni', 'fornitori'])
  })

  it('i collegamenti portano con sé il periodo', () => {
    // Un preset resta un preset, così il collegamento salvato fra i preferiti
    // continua a dire "anno corrente" anche l'anno prossimo.
    expect(linkVista('destinazioni', PRESET)).toBe('/report?vista=destinazioni&periodo=anno')
    expect(linkVista('operatori', SU_MISURA)).toBe(
      '/report?vista=operatori&da=2026-03-01&a=2026-06-30',
    )
  })

  it('l’esportazione viaggia sempre con due date risolte', () => {
    expect(linkEsporta('fornitori', PRESET)).toBe(
      '/report/esporta?vista=fornitori&da=2026-01-01&a=2026-12-31',
    )
  })

  it('riconosce le viste ammesse', () => {
    expect(isVista('operatori')).toBe(true)
    expect(isVista('clienti')).toBe(false)
  })
})
