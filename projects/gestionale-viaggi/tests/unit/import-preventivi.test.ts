import { describe, expect, it } from 'vitest'
import { buildRowValues, mapHeaders, QUOTE_IMPORT_FIELDS } from '@/lib/import-maps'
import { quoteImportSchema } from '@/lib/validation/pratiche'

function leggi(intestazioni: readonly string[], riga: Record<string, string>) {
  const mappature = mapHeaders(intestazioni, QUOTE_IMPORT_FIELDS)
  return buildRowValues(riga, QUOTE_IMPORT_FIELDS, mappature)
}

const COMPLETO = {
  Cliente: 'mario.rossi@example.it',
  Titolo: 'Capodanno a Lisbona',
  Destinazione: 'Lisbona',
  Partenza: '29/12/2026',
  Rientro: '02/01/2027',
  Passeggeri: '2',
  'Tipo di vendita': 'Organizzazione',
  Stato: 'Inviato',
  'Valido fino al': '30/11/2026',
  'Numero di origine': 'PREV-2026-114',
  Importo: '1.840,00',
  Costo: '1.420,00',
}

const con = (campi: Record<string, string>) =>
  quoteImportSchema.safeParse(
    leggi(Object.keys({ ...COMPLETO, ...campi }), { ...COMPLETO, ...campi }),
  )

describe('lettura di un preventivo', () => {
  it('riconosce le intestazioni del modello', () => {
    const esito = quoteImportSchema.safeParse(leggi(Object.keys(COMPLETO), COMPLETO))
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.departure_date).toBe('2026-12-29')
      expect(esito.data.valid_until).toBe('2026-11-30')
      expect(esito.data.importo).toBe(184_000)
      expect(esito.data.costo).toBe(142_000)
      expect(esito.data.riferimento).toBe('PREV-2026-114')
    }
  })

  // Le intestazioni di un altro gestionale: nessuno rinomina le colonne a mano.
  it('riconosce le intestazioni di un altro gestionale', () => {
    const esito = quoteImportSchema.safeParse(
      leggi(['intestatario', 'oggetto', 'localita', 'data_partenza', 'pax', 'quotazione', 'esito', 'protocollo'], {
        intestatario: 'Bianchi Silvia',
        oggetto: 'Settimana a Sharm',
        localita: 'Sharm el-Sheikh',
        data_partenza: '2027-05-10',
        pax: '4',
        quotazione: '3200',
        esito: 'Perso',
        protocollo: '2026/412',
      }),
    )
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.title).toBe('Settimana a Sharm')
      expect(esito.data.importo).toBe(320_000)
      expect(esito.data.status).toBe('rifiutato')
      expect(esito.data.riferimento).toBe('2026/412')
      // Senza colonna del costo la vendita è un'intermediazione.
      expect(esito.data.sale_type).toBe('intermediazione')
    }
  })
})

describe('stato del preventivo', () => {
  it('traduce le parole che ogni gestionale usa a modo suo', () => {
    for (const [scritto, atteso] of [
      ['Bozza', 'bozza'],
      ['Spedito', 'inviato'],
      ['Proposto', 'inviato'],
      ['Vinto', 'accettato'],
      ['Confermato', 'accettato'],
      ['Perso', 'rifiutato'],
      ['Scaduta', 'scaduto'],
    ] as const) {
      const esito = con({ Stato: scritto })
      expect(esito.success, scritto).toBe(true)
      if (esito.success) expect(esito.data.status, scritto).toBe(atteso)
    }
  })

  // «Convertito» lo assegna solo questo gestionale, quando la conversione la fa
  // lui: un preventivo convertito altrove è, qui, un preventivo accettato.
  it('porta il convertito altrove a accettato', () => {
    const esito = con({ Stato: 'Convertito' })
    expect(esito.success).toBe(true)
    if (esito.success) expect(esito.data.status).toBe('accettato')
  })

  // Un preventivo importato è già stato mostrato a qualcuno: senza la colonna
  // dello stato resta «inviato», non «bozza».
  it('senza la colonna dello stato lo considera inviato', () => {
    const esito = quoteImportSchema.safeParse(
      leggi(['Cliente', 'Titolo', 'Destinazione', 'Importo'], {
        Cliente: 'x@y.it', Titolo: 'Viaggio', Destinazione: 'Roma', Importo: '100',
      }),
    )
    expect(esito.success).toBe(true)
    if (esito.success) expect(esito.data.status).toBe('inviato')
  })

  it('su una parola sconosciuta non scarta la riga', () => {
    const esito = con({ Stato: 'in trattativa' })
    expect(esito.success).toBe(true)
    if (esito.success) expect(esito.data.status).toBe('inviato')
  })
})

describe('righe che non devono passare', () => {
  it('senza cliente', () => {
    const esito = con({ Cliente: '' })
    expect(esito.success).toBe(false)
  })

  it('con il rientro prima della partenza', () => {
    const esito = con({ Partenza: '10/05/2027', Rientro: '01/05/2027' })
    expect(esito.success).toBe(false)
    if (!esito.success) {
      expect(esito.error.issues[0]?.message).toContain('rientro')
    }
  })

  it('con un importo che non è un numero', () => {
    const esito = con({ Importo: 'da definire' })
    expect(esito.success).toBe(false)
  })
})
