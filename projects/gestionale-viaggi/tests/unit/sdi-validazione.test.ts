import { describe, expect, it } from 'vitest'
import {
  verificaAgenzia,
  verificaCliente,
  verificaFattura,
  verificaTutto,
  type AgenziaDaVerificare,
  type FatturaDaVerificare,
  type SoggettoDaVerificare,
} from '@/lib/sdi/validazione'
import type { RigaFattura } from '@/lib/sdi/riepilogo'

const AGENZIA: AgenziaDaVerificare = {
  denominazione: 'Orizzonti Viaggi S.r.l.',
  partitaIva: '00743110157',
  indirizzo: 'Via Roma 12',
  cap: '20121',
  comune: 'Milano',
  provincia: 'MI',
  nazione: 'IT',
  regimeFiscale: 'RF01',
}

const CLIENTE: SoggettoDaVerificare = {
  denominazione: 'Rossi Trasporti S.p.A.',
  partitaIva: '03918470125',
  indirizzo: 'Corso Italia 4',
  cap: '21100',
  comune: 'Varese',
  provincia: 'VA',
  nazione: 'IT',
}

const RIGA: RigaFattura = {
  descrizione: 'Pacchetto Azzorre',
  quantita: 1,
  prezzoUnitarioCentesimi: 100_000,
  regime: 'art_74_ter',
  aliquotaBps: 0,
}

const FATTURA: FatturaDaVerificare = {
  tipo: 'TD01',
  numero: '2026/17',
  data: '2026-03-14',
  righe: [RIGA],
  codiceDestinatario: 'ABC1234',
  bolloCentesimi: 0,
}

const messaggi = (r: readonly { messaggio: string }[]) => r.map((x) => x.messaggio).join(' | ')

describe('agenzia', () => {
  it('una configurazione completa non produce rilievi', () => {
    expect(verificaAgenzia(AGENZIA)).toHaveLength(0)
  })

  it('senza partita IVA blocca', () => {
    const r = verificaAgenzia({ ...AGENZIA, partitaIva: null })
    expect(r.some((x) => x.gravita === 'blocco')).toBe(true)
    expect(messaggi(r)).toContain('partita IVA')
  })

  it('una partita IVA con una cifra saltata blocca', () => {
    const r = verificaAgenzia({ ...AGENZIA, partitaIva: '00743110158' })
    expect(messaggi(r)).toContain('cifra di controllo')
  })

  it('un regime fiscale inventato blocca', () => {
    const r = verificaAgenzia({ ...AGENZIA, regimeFiscale: 'RF99' })
    expect(messaggi(r)).toContain('regime fiscale')
  })

  it('accetta il regime delle agenzie di viaggio', () => {
    expect(verificaAgenzia({ ...AGENZIA, regimeFiscale: 'RF11' })).toHaveLength(0)
  })

  // Il blocco REA e' facoltativo per intero ma vietato a meta': e' un errore
  // che si fa compilando un campo e dimenticando l'altro.
  it('il REA a metà blocca', () => {
    expect(messaggi(verificaAgenzia({ ...AGENZIA, reaNumero: 'MI-123456' }))).toContain('REA')
    expect(messaggi(verificaAgenzia({ ...AGENZIA, reaUfficio: 'MI' }))).toContain('REA')
  })

  it('il REA completo non produce rilievi', () => {
    expect(verificaAgenzia({ ...AGENZIA, reaNumero: '123456', reaUfficio: 'MI' })).toHaveLength(0)
  })

  it('una provincia scritta per esteso blocca', () => {
    expect(messaggi(verificaAgenzia({ ...AGENZIA, provincia: 'Milano' }))).toContain('provincia')
  })

  it('un CAP di quattro cifre blocca', () => {
    expect(messaggi(verificaAgenzia({ ...AGENZIA, cap: '2012' }))).toContain('CAP')
  })
})

describe('cliente', () => {
  it('un cliente completo non produce rilievi', () => {
    expect(verificaCliente(CLIENTE)).toHaveLength(0)
  })

  it('senza né partita IVA né codice fiscale blocca', () => {
    const r = verificaCliente({ ...CLIENTE, partitaIva: null, codiceFiscale: null })
    expect(r.some((x) => x.gravita === 'blocco')).toBe(true)
  })

  it('un privato con il solo codice fiscale va bene', () => {
    const r = verificaCliente({
      nome: 'Mario',
      cognome: 'Rossi',
      denominazione: null,
      partitaIva: null,
      codiceFiscale: 'RSSMRA80A01F205X',
      indirizzo: 'Via Verdi 1',
      cap: '20100',
      comune: 'Milano',
      provincia: 'MI',
      nazione: 'IT',
    })
    expect(r).toHaveLength(0)
  })

  it('senza nome né ragione sociale blocca', () => {
    const r = verificaCliente({ ...CLIENTE, denominazione: null })
    expect(messaggi(r)).toContain('ragione sociale')
  })

  // A un cliente estero non si chiede la sigla della provincia italiana, e la
  // sua partita IVA non ha la nostra cifra di controllo.
  it('un cliente estero non deve avere provincia italiana né cifra di controllo', () => {
    const r = verificaCliente({
      denominazione: 'Azores DMC Lda',
      partitaIva: 'PT501234567',
      indirizzo: 'Rua do Mar 3',
      cap: '9500',
      comune: 'Ponta Delgada',
      provincia: null,
      nazione: 'PT',
    })
    expect(r).toHaveLength(0)
  })
})

describe('fattura', () => {
  it('una fattura completa non produce blocchi', () => {
    expect(verificaFattura(FATTURA).filter((r) => r.gravita === 'blocco')).toHaveLength(0)
  })

  it('senza righe blocca', () => {
    expect(messaggi(verificaFattura({ ...FATTURA, righe: [] }))).toContain('non ha righe')
  })

  it('una riga senza descrizione blocca', () => {
    const r = verificaFattura({ ...FATTURA, righe: [{ ...RIGA, descrizione: '  ' }] })
    expect(messaggi(r)).toContain('riga 1')
  })

  it('una riga con quantità zero blocca', () => {
    const r = verificaFattura({ ...FATTURA, righe: [{ ...RIGA, quantita: 0 }] })
    expect(messaggi(r)).toContain('quantità zero')
  })

  it('una Natura inventata blocca', () => {
    const r = verificaFattura({
      ...FATTURA,
      righe: [{ ...RIGA, naturaScavalcata: 'N9' }],
    })
    expect(messaggi(r)).toContain('non è un codice riconosciuto')
  })

  it('una nota di credito senza fattura collegata blocca', () => {
    const r = verificaFattura({ ...FATTURA, tipo: 'TD04' })
    expect(messaggi(r)).toContain('nota di credito')
  })

  it('una nota di credito collegata non blocca', () => {
    const r = verificaFattura({
      ...FATTURA,
      tipo: 'TD04',
      documentoRettificato: { numero: '2026/17', data: '2026-03-14' },
    })
    expect(r.filter((x) => x.gravita === 'blocco')).toHaveLength(0)
  })

  it('un codice destinatario di tre lettere blocca', () => {
    expect(messaggi(verificaFattura({ ...FATTURA, codiceDestinatario: 'ABC' }))).toContain(
      'sei o sette caratteri',
    )
  })

  // Senza recapito la fattura e' valida e viene messa nel cassetto fiscale:
  // e' un avviso, non un blocco, perche' per un privato e' la normalita'.
  it('senza codice né PEC avvisa ma non blocca', () => {
    const r = verificaFattura({ ...FATTURA, codiceDestinatario: '0000000' })
    expect(r.filter((x) => x.gravita === 'blocco')).toHaveLength(0)
    expect(r.some((x) => x.gravita === 'avviso')).toBe(true)
  })

  it('un bollo diverso da due euro avvisa', () => {
    const r = verificaFattura({ ...FATTURA, bolloCentesimi: 500 })
    expect(r.some((x) => x.gravita === 'avviso')).toBe(true)
  })
})

describe('verifica complessiva', () => {
  it('dice trasmettibile quando non ci sono blocchi', () => {
    const esito = verificaTutto(AGENZIA, CLIENTE, FATTURA)
    expect(esito.trasmettibile).toBe(true)
    expect(esito.bloccanti).toHaveLength(0)
  })

  it('non è trasmettibile se manca qualcosa, e dice dove si corregge', () => {
    const esito = verificaTutto({ ...AGENZIA, partitaIva: null }, CLIENTE, FATTURA)
    expect(esito.trasmettibile).toBe(false)
    expect(esito.bloccanti[0]?.dove).toBe('Impostazioni → Agenzia')
  })

  it('raccoglie i rilievi di tutti e tre i soggetti insieme', () => {
    const esito = verificaTutto(
      { ...AGENZIA, regimeFiscale: null },
      { ...CLIENTE, indirizzo: null },
      { ...FATTURA, righe: [] },
    )
    const dove = new Set(esito.bloccanti.map((r) => r.dove))
    expect(dove.size).toBe(3)
  })
})
