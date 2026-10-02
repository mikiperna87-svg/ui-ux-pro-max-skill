import { describe, expect, it } from 'vitest'
import { componiPrimiPassi, type ConteggiIniziali } from '@/lib/primi-passi'

/**
 * Le regole del primo giorno.
 *
 * Due cose devono reggere. Che un passo sia «fatto» dipenda dai dati e da niente
 * altro: una spunta che resta accesa dopo che i dati sono stati cancellati è
 * peggio di nessuna spunta. E che i passi facoltativi non impediscano di dire
 * che la configurazione è finita, altrimenti il riquadro non se ne va mai.
 */
const VUOTA: ConteggiIniziali = {
  datiFiscali: false,
  clienti: 0,
  fornitori: 0,
  pratiche: 0,
  documenti: 0,
  persone: 1,
  nascosto: false,
}

const passo = (stato: ReturnType<typeof componiPrimiPassi>, chiave: string) => {
  const trovato = stato.passi.find((voce) => voce.chiave === chiave)
  if (!trovato) throw new Error(`passo ${chiave} assente`)
  return trovato
}

describe('agenzia appena nata', () => {
  const stato = componiPrimiPassi(VUOTA)

  it('non ha nessun passo fatto', () => {
    expect(stato.fatti).toBe(0)
    expect(stato.totale).toBe(6)
    expect(stato.completo).toBe(false)
  })

  it('mette per primi i dati dell’agenzia', () => {
    expect(stato.passi[0]?.chiave).toBe('agenzia')
  })

  // L'ordine non è estetico: una pratica senza il suo cliente in anagrafica
  // viene scartata, quindi i clienti vengono prima.
  it('mette i clienti prima di pratiche e documenti', () => {
    const chiavi = stato.passi.map((voce) => voce.chiave)
    expect(chiavi.indexOf('clienti')).toBeLessThan(chiavi.indexOf('pratiche'))
    expect(chiavi.indexOf('clienti')).toBeLessThan(chiavi.indexOf('documenti'))
  })

  it('ogni passo dice dove andare e che cosa fare', () => {
    for (const voce of stato.passi) {
      expect(voce.href.startsWith('/'), voce.chiave).toBe(true)
      expect(voce.azione.length, voce.chiave).toBeGreaterThan(3)
      expect(voce.motivo.length, voce.chiave).toBeGreaterThan(20)
    }
  })
})

describe('un passo si spunta quando il dato c’è', () => {
  it('i clienti', () => {
    expect(passo(componiPrimiPassi({ ...VUOTA, clienti: 1 }), 'clienti').fatto).toBe(true)
    expect(passo(componiPrimiPassi(VUOTA), 'clienti').fatto).toBe(false)
  })

  it('i dati fiscali, solo quando sono tutti', () => {
    expect(passo(componiPrimiPassi({ ...VUOTA, datiFiscali: true }), 'agenzia').fatto).toBe(true)
    expect(passo(componiPrimiPassi(VUOTA), 'agenzia').fatto).toBe(false)
  })

  // L'iscrizione del titolare esiste dal primo istante: da sola non vuol dire
  // che abbia invitato qualcuno.
  it('le persone solo dalla seconda', () => {
    expect(passo(componiPrimiPassi({ ...VUOTA, persone: 1 }), 'persone').fatto).toBe(false)
    expect(passo(componiPrimiPassi({ ...VUOTA, persone: 2 }), 'persone').fatto).toBe(true)
  })
})

describe('quando la configurazione è finita', () => {
  const necessari: ConteggiIniziali = {
    ...VUOTA,
    datiFiscali: true,
    clienti: 12,
    fornitori: 3,
    pratiche: 40,
  }

  it('i passi facoltativi non la trattengono', () => {
    const stato = componiPrimiPassi(necessari)
    expect(stato.completo).toBe(true)
    expect(stato.fatti).toBe(4)
    expect(passo(stato, 'documenti').facoltativo).toBe(true)
    expect(passo(stato, 'persone').facoltativo).toBe(true)
  })

  it('con tutto fatto il conto arriva al totale', () => {
    const stato = componiPrimiPassi({ ...necessari, documenti: 5, persone: 3 })
    expect(stato.fatti).toBe(stato.totale)
    expect(stato.completo).toBe(true)
  })

  it('un passo necessario che torna indietro la riapre', () => {
    const stato = componiPrimiPassi({ ...necessari, clienti: 0 })
    expect(stato.completo).toBe(false)
    expect(passo(stato, 'clienti').fatto).toBe(false)
  })
})

describe('il riquadro nascosto', () => {
  it('resta nascosto anche con passi da fare', () => {
    expect(componiPrimiPassi({ ...VUOTA, nascosto: true }).nascosto).toBe(true)
    expect(componiPrimiPassi({ ...VUOTA, nascosto: true }).fatti).toBe(0)
  })
})
