import { describe, expect, it } from 'vitest'
import { BOOKING_IMPORT_FIELDS, buildRowValues, mapHeaders } from '@/lib/import-maps'
import { bookingImportSchema } from '@/lib/validation/pratiche'

/**
 * L'importazione delle pratiche deve reggere i file veri, che arrivano da
 * gestionali diversi: intestazioni scritte come capita, stati con parole
 * proprie, colonne che mancano del tutto.
 */
function leggi(intestazioni: readonly string[], riga: Record<string, string>) {
  const mappature = mapHeaders(intestazioni, BOOKING_IMPORT_FIELDS)
  return buildRowValues(riga, BOOKING_IMPORT_FIELDS, mappature)
}

const COMPLETA = {
  Cliente: 'mario.rossi@example.it',
  Titolo: 'Capodanno a Lisbona',
  Destinazione: 'Lisbona',
  Partenza: '29/12/2026',
  Rientro: '02/01/2027',
  Passeggeri: '2',
  'Tipo di vendita': 'Organizzazione',
  Stato: 'Confermata',
  Importo: '1.840,00',
  Costo: '1.420,00',
}

describe('lettura di una riga', () => {
  it('riconosce le intestazioni del modello', () => {
    const valori = leggi(Object.keys(COMPLETA), COMPLETA)
    const esito = bookingImportSchema.safeParse(valori)
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.departure_date).toBe('2026-12-29')
      expect(esito.data.importo).toBe(184_000)
      expect(esito.data.costo).toBe(142_000)
      expect(esito.data.pax_count).toBe(2)
    }
  })

  // Nessuno rinomina duemila righe a mano per far contento un programma.
  it('riconosce le intestazioni di un altro gestionale', () => {
    const valori = leggi(
      ['intestatario', 'descrizione', 'localita', 'data_partenza', 'pax', 'prezzo', 'acquisto'],
      {
        intestatario: 'Bianchi Silvia',
        descrizione: 'Settimana a Sharm',
        localita: 'Sharm el-Sheikh',
        data_partenza: '2027-05-10',
        pax: '4',
        prezzo: '3200',
        acquisto: '2500',
      },
    )
    const esito = bookingImportSchema.safeParse(valori)
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.title).toBe('Settimana a Sharm')
      expect(esito.data.importo).toBe(320_000)
    }
  })
})

describe('stato e tipo di vendita', () => {
  const con = (campi: Record<string, string>) =>
    bookingImportSchema.safeParse(leggi(Object.keys({ ...COMPLETA, ...campi }), { ...COMPLETA, ...campi }))

  it('traduce le parole che ogni gestionale usa a modo suo', () => {
    for (const [scritto, atteso] of [
      ['Prenotata', 'confermata'],
      ['Opzionata', 'opzione'],
      ['Cancellata', 'annullata'],
      ['Chiusa', 'conclusa'],
      ['Preventivo', 'bozza'],
    ] as const) {
      const esito = con({ Stato: scritto })
      expect(esito.success, scritto).toBe(true)
      if (esito.success) expect(esito.data.status, scritto).toBe(atteso)
    }
  })

  it('traduce anche il tipo di vendita', () => {
    for (const [scritto, atteso] of [
      ['Pacchetto', 'organizzazione'],
      ['Tour', 'organizzazione'],
      ['Biglietteria', 'intermediazione'],
      ['Commissione', 'intermediazione'],
    ] as const) {
      const esito = con({ 'Tipo di vendita': scritto })
      expect(esito.success, scritto).toBe(true)
      if (esito.success) expect(esito.data.sale_type, scritto).toBe(atteso)
    }
  })

  // Una parola sconosciuta non deve far cadere la riga: cade il file intero,
  // e chi migra rinuncia.
  it('su una parola sconosciuta sceglie il valore più comune', () => {
    const esito = con({ Stato: 'boh', 'Tipo di vendita': 'misto' })
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.status).toBe('confermata')
      expect(esito.data.sale_type).toBe('intermediazione')
    }
  })
})

describe('colonne che mancano', () => {
  it('senza la colonna del tipo di vendita la deduce dal costo', () => {
    const conCosto = bookingImportSchema.safeParse(
      leggi(['Cliente', 'Titolo', 'Destinazione', 'Importo', 'Costo'], {
        Cliente: 'x@y.it', Titolo: 'Viaggio', Destinazione: 'Roma', Importo: '100', Costo: '60',
      }),
    )
    const senzaCosto = bookingImportSchema.safeParse(
      leggi(['Cliente', 'Titolo', 'Destinazione', 'Importo'], {
        Cliente: 'x@y.it', Titolo: 'Viaggio', Destinazione: 'Roma', Importo: '100',
      }),
    )
    expect(conCosto.success && conCosto.data.sale_type).toBe('organizzazione')
    expect(senzaCosto.success && senzaCosto.data.sale_type).toBe('intermediazione')
  })

  it('senza passeggeri ne conta uno', () => {
    const esito = bookingImportSchema.safeParse(
      leggi(['Cliente', 'Titolo', 'Destinazione'], {
        Cliente: 'x@y.it', Titolo: 'Viaggio', Destinazione: 'Roma',
      }),
    )
    expect(esito.success && esito.data.pax_count).toBe(1)
  })
})

describe('righe che non si importano', () => {
  it('senza cliente', () => {
    const esito = bookingImportSchema.safeParse(leggi(Object.keys(COMPLETA), { ...COMPLETA, Cliente: '' }))
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0]?.message).toContain('cliente')
  })

  it('senza destinazione', () => {
    const esito = bookingImportSchema.safeParse(leggi(Object.keys(COMPLETA), { ...COMPLETA, Destinazione: '' }))
    expect(esito.success).toBe(false)
  })

  it('con il rientro prima della partenza', () => {
    const esito = bookingImportSchema.safeParse(
      leggi(Object.keys(COMPLETA), { ...COMPLETA, Rientro: '01/12/2026' }),
    )
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0]?.message).toContain('rientro')
  })

  it('con un importo che non è un importo', () => {
    const esito = bookingImportSchema.safeParse(
      leggi(Object.keys(COMPLETA), { ...COMPLETA, Importo: 'da definire' }),
    )
    expect(esito.success).toBe(false)
  })
})
