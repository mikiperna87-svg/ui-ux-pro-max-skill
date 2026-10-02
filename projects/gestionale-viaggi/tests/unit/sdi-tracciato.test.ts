import { describe, expect, it } from 'vitest'
import {
  costruisciXml,
  daBps,
  daCentesimi,
  nomeFile,
  prezzoUnitario,
  type DatiTracciato,
} from '@/lib/sdi/tracciato'
import { riepiloghiDaRighe, totaleDocumento, type RigaFattura } from '@/lib/sdi/riepilogo'

const AGENZIA = {
  denominazione: 'Orizzonti Viaggi S.r.l.',
  paeseIva: 'IT',
  partitaIva: '00743110157',
  indirizzo: 'Via Roma 12',
  cap: '20121',
  comune: 'Milano',
  provincia: 'MI',
  nazione: 'IT',
  regimeFiscale: 'RF01',
  rea: null,
}

const CLIENTE = {
  denominazione: 'Rossi Trasporti S.p.A.',
  paeseIva: 'IT',
  partitaIva: '03918470125',
  indirizzo: 'Corso Italia 4',
  cap: '21100',
  comune: 'Varese',
  provincia: 'VA',
  nazione: 'IT',
}

function dati(sovrascrivi: Partial<DatiTracciato> = {}): DatiTracciato {
  return {
    trasmissione: {
      paeseTrasmittente: 'IT',
      codiceTrasmittente: '00743110157',
      progressivo: '00001',
      codiceDestinatario: 'ABC1234',
    },
    cedente: AGENZIA,
    cessionario: CLIENTE,
    documento: {
      tipo: 'TD01',
      data: '2026-03-14',
      numero: '2026/17',
      totaleCentesimi: 100_000,
      bolloCentesimi: 0,
    },
    righe: [
      {
        numero: 1,
        descrizione: 'Pacchetto Azzorre',
        quantita: 1,
        prezzoTotaleCentesimi: 100_000,
        aliquotaBps: 2200,
      },
    ],
    riepiloghi: [
      { aliquotaBps: 2200, imponibileCentesimi: 81_967, impostaCentesimi: 18_033 },
    ],
    ...sovrascrivi,
  }
}

describe('conversione degli importi', () => {
  it('scrive i centesimi come decimale con il punto', () => {
    expect(daCentesimi(122_000)).toBe('1220.00')
    expect(daCentesimi(5)).toBe('0.05')
    expect(daCentesimi(0)).toBe('0.00')
    expect(daCentesimi(-1234)).toBe('-12.34')
  })

  it('scrive l’aliquota in centesimi di punto come percentuale', () => {
    expect(daBps(2200)).toBe('22.00')
    expect(daBps(1000)).toBe('10.00')
    expect(daBps(0)).toBe('0.00')
    expect(daBps(450)).toBe('4.50')
  })
})

describe('prezzo unitario', () => {
  it('con quantità uno è il totale della riga', () => {
    expect(prezzoUnitario(8197, 1)).toBe('81.97')
  })

  it('divide senza perdere il totale, fino a otto decimali', () => {
    // 81,97 diviso tre non è un numero tondo: il totale resta esatto e la
    // divisione si porta nei decimali, dove il tracciato la accetta.
    expect(prezzoUnitario(8197, 3)).toBe('27.32333333')
  })

  it('tiene almeno due decimali anche quando la divisione è esatta', () => {
    expect(prezzoUnitario(10_000, 4)).toBe('25.00')
    expect(prezzoUnitario(0, 1)).toBe('0.00')
  })
})

describe('struttura del file', () => {
  it('apre con la dichiarazione e la radice della versione 1.2', () => {
    const xml = costruisciXml(dati())
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<p:FatturaElettronica versione="FPR12"')
    expect(xml).toContain('xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"')
    expect(xml.trimEnd().endsWith('</p:FatturaElettronica>')).toBe(true)
  })

  it('contiene una sola testata e un solo corpo', () => {
    const xml = costruisciXml(dati())
    expect(xml.match(/<FatturaElettronicaHeader>/g)).toHaveLength(1)
    expect(xml.match(/<FatturaElettronicaBody>/g)).toHaveLength(1)
  })

  it('mette il regime fiscale del cedente e non quello del cliente', () => {
    const xml = costruisciXml(dati())
    expect(xml).toContain('<RegimeFiscale>RF01</RegimeFiscale>')
    expect(xml.match(/<RegimeFiscale>/g)).toHaveLength(1)
  })
})

describe('Natura e aliquota, che si escludono', () => {
  it('con aliquota diversa da zero non scrive la Natura', () => {
    const xml = costruisciXml(dati())
    expect(xml).not.toContain('<Natura>')
  })

  it('con aliquota zero scrive la Natura sulla riga e sul riepilogo', () => {
    const xml = costruisciXml(
      dati({
        righe: [
          {
            numero: 1,
            descrizione: 'Pacchetto Azzorre',
            quantita: 1,
            prezzoTotaleCentesimi: 100_000,
            aliquotaBps: 0,
            natura: 'N5',
          },
        ],
        riepiloghi: [
          {
            aliquotaBps: 0,
            natura: 'N5',
            imponibileCentesimi: 100_000,
            impostaCentesimi: 0,
            riferimentoNormativo: 'Art. 74-ter DPR 633/72',
          },
        ],
      }),
    )
    expect(xml.match(/<Natura>N5<\/Natura>/g)).toHaveLength(2)
    expect(xml).toContain('<RiferimentoNormativo>Art. 74-ter DPR 633/72</RiferimentoNormativo>')
  })

  // Una Natura passata per errore con l'aliquota piena non deve finire nel file:
  // e' uno degli scarti piu' comuni, e lo si evita qui invece che sperando
  // nella disciplina di chi chiama.
  it('scarta una Natura arrivata insieme a un’aliquota piena', () => {
    const xml = costruisciXml(
      dati({
        righe: [
          {
            numero: 1,
            descrizione: 'Pacchetto',
            quantita: 1,
            prezzoTotaleCentesimi: 100_000,
            aliquotaBps: 2200,
            natura: 'N5',
          },
        ],
      }),
    )
    expect(xml).not.toContain('<Natura>')
  })
})

describe('destinatario', () => {
  it('con un codice destinatario vero non scrive la PEC', () => {
    const xml = costruisciXml(
      dati({
        trasmissione: {
          paeseTrasmittente: 'IT',
          codiceTrasmittente: '00743110157',
          progressivo: '00001',
          codiceDestinatario: 'ABC1234',
          pecDestinatario: 'cliente@pec.it',
        },
      }),
    )
    expect(xml).toContain('<CodiceDestinatario>ABC1234</CodiceDestinatario>')
    expect(xml).not.toContain('PECDestinatario')
  })

  it('senza codice scrive la PEC accanto ai sette zeri', () => {
    const xml = costruisciXml(
      dati({
        trasmissione: {
          paeseTrasmittente: 'IT',
          codiceTrasmittente: '00743110157',
          progressivo: '00001',
          codiceDestinatario: '0000000',
          pecDestinatario: 'cliente@pec.it',
        },
      }),
    )
    expect(xml).toContain('<CodiceDestinatario>0000000</CodiceDestinatario>')
    expect(xml).toContain('<PECDestinatario>cliente@pec.it</PECDestinatario>')
  })
})

describe('bollo e nota di credito', () => {
  it('senza bollo non scrive il blocco', () => {
    expect(costruisciXml(dati())).not.toContain('DatiBollo')
  })

  it('con il bollo lo scrive come virtuale', () => {
    const xml = costruisciXml(dati({ documento: { ...dati().documento, bolloCentesimi: 200 } }))
    expect(xml).toContain('<BolloVirtuale>SI</BolloVirtuale>')
    expect(xml).toContain('<ImportoBollo>2.00</ImportoBollo>')
  })

  it('la nota di credito è TD04 e cita la fattura che rettifica', () => {
    const xml = costruisciXml(
      dati({
        documento: {
          tipo: 'TD04',
          data: '2026-04-02',
          numero: 'NC 2026/3',
          totaleCentesimi: 12_200,
          bolloCentesimi: 0,
          documentoRettificato: { numero: '2026/17', data: '2026-03-14' },
        },
      }),
    )
    expect(xml).toContain('<TipoDocumento>TD04</TipoDocumento>')
    expect(xml).toContain('<IdDocumento>2026/17</IdDocumento>')
    expect(xml).toContain('<DatiFattureCollegate>')
  })
})

describe('caratteri speciali', () => {
  it('protegge la e commerciale e gli apici nelle descrizioni', () => {
    const xml = costruisciXml(
      dati({
        cedente: { ...AGENZIA, denominazione: 'Viaggi & Vacanze dell’Est "Blu" <S.r.l.>' },
      }),
    )
    expect(xml).toContain('Viaggi &amp; Vacanze dell’Est &quot;Blu&quot; &lt;S.r.l.&gt;')
    expect(xml).not.toContain('<S.r.l.>')
  })
})

describe('nome del file', () => {
  it('unisce paese, identificativo e progressivo', () => {
    expect(nomeFile('it', '00743110157', '00001')).toBe('IT00743110157_00001.xml')
  })
})

describe('riepiloghi', () => {
  const riga = (p: Partial<RigaFattura> = {}): RigaFattura => ({
    descrizione: 'Servizio',
    quantita: 1,
    prezzoUnitarioCentesimi: 10_000,
    regime: 'ordinaria',
    aliquotaBps: 2200,
    ...p,
  })

  it('raggruppa le righe con la stessa aliquota', () => {
    const r = riepiloghiDaRighe([riga(), riga(), riga({ aliquotaBps: 1000 })])
    expect(r).toHaveLength(2)
    expect(r[0]?.aliquotaBps).toBe(2200)
  })

  // Il prezzo di riga è IVA inclusa: cento euro al 22% valgono 81,97 di
  // imponibile e 18,03 di imposta, non 100 più 22. È la stessa formula del
  // database, e se qui divergesse il file XML direbbe un totale diverso dalla
  // fattura che il cliente ha in mano.
  it('scorpora l’IVA dal prezzo invece di aggiungerla sopra', () => {
    const r = riepiloghiDaRighe([riga()])
    expect(r[0]?.imponibileCentesimi).toBe(8197)
    expect(r[0]?.impostaCentesimi).toBe(1803)
    expect(totaleDocumento(r)).toBe(10_000)
  })

  it('il totale del documento torna con il prezzo fatturato', () => {
    const r = riepiloghiDaRighe([
      riga({ prezzoUnitarioCentesimi: 31_625 }),
      riga({ prezzoUnitarioCentesimi: 5_000, aliquotaBps: 1000 }),
    ])
    expect(totaleDocumento(r)).toBe(36_625)
  })

  it('somma riga per riga, come fa il database', () => {
    const r = riepiloghiDaRighe([
      riga({ prezzoUnitarioCentesimi: 3333 }),
      riga({ prezzoUnitarioCentesimi: 3333 }),
      riga({ prezzoUnitarioCentesimi: 3333 }),
    ])
    const unaRiga = riepiloghiDaRighe([riga({ prezzoUnitarioCentesimi: 3333 })])
    expect(r[0]?.imponibileCentesimi).toBe((unaRiga[0]?.imponibileCentesimi ?? 0) * 3)
    expect(r[0]?.impostaCentesimi).toBe((unaRiga[0]?.impostaCentesimi ?? 0) * 3)
    expect(totaleDocumento(r)).toBe(9999)
  })

  it('porta il regime 74-ter ad aliquota zero, Natura N5 e imposta zero', () => {
    const r = riepiloghiDaRighe([riga({ regime: 'art_74_ter', aliquotaBps: 2200 })])
    expect(r[0]?.aliquotaBps).toBe(0)
    expect(r[0]?.natura).toBe('N5')
    expect(r[0]?.impostaCentesimi).toBe(0)
    // Nel 74-ter l'imponibile dichiarato è il corrispettivo intero: il margine
    // riguarda i registri dell'agenzia, non la fattura al cliente.
    expect(r[0]?.imponibileCentesimi).toBe(10_000)
    expect(r[0]?.riferimentoNormativo).toContain('74-ter')
  })

  it('tiene separate due righe esenti con Nature diverse', () => {
    const r = riepiloghiDaRighe([
      riga({ regime: 'art_74_ter' }),
      riga({ regime: 'esente_art_10' }),
    ])
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.natura).sort()).toEqual(['N4', 'N5'])
  })

  it('rispetta la deroga sulla Natura quando c’è', () => {
    const r = riepiloghiDaRighe([riga({ regime: 'reverse_charge', naturaScavalcata: 'N6.3' })])
    expect(r[0]?.natura).toBe('N6.3')
  })

  it('il bollo si somma al totale', () => {
    const r = riepiloghiDaRighe([riga()])
    expect(totaleDocumento(r, 200)).toBe(10_200)
  })
})
