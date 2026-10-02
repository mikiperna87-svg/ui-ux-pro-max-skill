import { describe, expect, it } from 'vitest'
import { raggruppaDocumenti, type RigaDocumento } from '@/lib/import-fatture'
import { buildRowValues, INVOICE_IMPORT_FIELDS, mapHeaders } from '@/lib/import-maps'
import { legacyInvoiceImportSchema } from '@/lib/validation/fatture'

function leggi(intestazioni: readonly string[], riga: Record<string, string>) {
  const mappature = mapHeaders(intestazioni, INVOICE_IMPORT_FIELDS)
  return buildRowValues(riga, INVOICE_IMPORT_FIELDS, mappature)
}

const COMPLETA = {
  Numero: '417',
  'Tipo di documento': 'Fattura',
  Cliente: 'mario.rossi@example.it',
  'Data di emissione': '14/11/2025',
  Scadenza: '14/12/2025',
  Stato: 'Pagata',
  'Regime IVA': 'Margine',
  Codice: 'FT-2025/0417',
  Descrizione: 'Pacchetto Lisbona',
  Quantità: '1',
  Importo: '1.840,00',
  'Costo del viaggio': '1.420,00',
  'Aliquota IVA': '22',
}

const con = (campi: Record<string, string>) =>
  legacyInvoiceImportSchema.safeParse(
    leggi(Object.keys({ ...COMPLETA, ...campi }), { ...COMPLETA, ...campi }),
  )

/** Riga valida pronta per il raggruppamento. */
function riga(line: number, campi: Record<string, string> = {}): RigaDocumento {
  const esito = con(campi)
  if (!esito.success) {
    throw new Error(`riga non valida: ${esito.error.issues.map((p) => p.message).join('; ')}`)
  }
  return { line, dati: esito.data }
}

describe('lettura di un documento pregresso', () => {
  it('riconosce le intestazioni del modello', () => {
    const esito = legacyInvoiceImportSchema.safeParse(leggi(Object.keys(COMPLETA), COMPLETA))
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.number).toBe(417)
      expect(esito.data.kind).toBe('fattura')
      expect(esito.data.issue_date).toBe('2025-11-14')
      expect(esito.data.due_date).toBe('2025-12-14')
      expect(esito.data.status).toBe('pagata')
      expect(esito.data.vat_regime).toBe('art_74_ter')
      expect(esito.data.code).toBe('FT-2025/0417')
      expect(esito.data.importo).toBe(184_000)
      expect(esito.data.costo).toBe(142_000)
      expect(esito.data.vat_percent).toBe(2200)
    }
  })

  it('riconosce le intestazioni di un altro gestionale', () => {
    const esito = legacyInvoiceImportSchema.safeParse(
      leggi(['n_documento', 'documento', 'intestatario', 'data_documento', 'descrizione', 'totale', 'aliquota'], {
        n_documento: '58',
        documento: 'NC',
        intestatario: 'Bianchi Silvia',
        data_documento: '2025-03-02',
        descrizione: 'Storno penale annullamento',
        totale: '120',
        aliquota: '22',
      }),
    )
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.kind).toBe('nota_credito')
      expect(esito.data.number).toBe(58)
      expect(esito.data.importo).toBe(12_000)
      // Senza la colonna del costo il regime non è il margine.
      expect(esito.data.vat_regime).toBe('ordinaria')
      // Senza la colonna dello stato: emesso e non incassato.
      expect(esito.data.status).toBe('emessa')
    }
  })

  it('traduce le parole con cui i gestionali scrivono lo stato', () => {
    for (const [scritto, atteso] of [
      ['Da incassare', 'emessa'],
      ['Spedita', 'inviata'],
      ['Incassata', 'pagata'],
      ['Saldata', 'pagata'],
      ['Stornata', 'annullata'],
    ] as const) {
      const esito = con({ Stato: scritto })
      expect(esito.success, scritto).toBe(true)
      if (esito.success) expect(esito.data.status, scritto).toBe(atteso)
    }
  })

  it('traduce le parole con cui i gestionali scrivono il regime', () => {
    for (const [scritto, atteso] of [
      ['Regime del margine', 'art_74_ter'],
      ['74-ter', 'art_74_ter'],
      ['Ordinaria', 'ordinaria'],
      ['Esente', 'esente_art_10'],
      ['Fuori campo', 'fuori_campo'],
      ['Inversione contabile', 'reverse_charge'],
    ] as const) {
      const esito = con({ 'Regime IVA': scritto })
      expect(esito.success, scritto).toBe(true)
      if (esito.success) expect(esito.data.vat_regime, scritto).toBe(atteso)
    }
  })
})

describe('righe che non devono passare', () => {
  // Un documento senza numero non è un documento: la riga va vista, non
  // importata con un numero inventato.
  it('senza numero', () => {
    const esito = con({ Numero: '' })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0]?.message).toContain('numero')
  })

  it('con un numero che non è solo cifre', () => {
    const esito = con({ Numero: 'FT-2025/0417' })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0]?.message).toContain('Codice')
  })

  it('senza descrizione della riga', () => {
    expect(con({ Descrizione: '' }).success).toBe(false)
  })

  it('senza importo', () => {
    expect(con({ Importo: '' }).success).toBe(false)
  })

  it('con una data di emissione nel futuro', () => {
    const esito = con({ 'Data di emissione': '31/12/2099' })
    expect(esito.success).toBe(false)
    if (!esito.success) expect(esito.error.issues[0]?.message).toContain('futuro')
  })

  // Lo stato «bozza» non esiste per un documento importato: esiste già altrove.
  it('con lo stato bozza', () => {
    const esito = con({ Stato: 'Bozza' })
    // «bozza» non è nel vocabolario: diventa «emessa», non viene scartata.
    expect(esito.success).toBe(true)
    if (esito.success) expect(esito.data.status).toBe('emessa')
  })
})

describe('raggruppamento delle righe in documenti', () => {
  it('mette insieme le righe con lo stesso numero e la stessa data', () => {
    const { documenti, conflitti } = raggruppaDocumenti([
      riga(2),
      riga(3, { Descrizione: 'Assicurazione', Importo: '45,00', 'Costo del viaggio': '30,00', Quantità: '2' }),
      riga(4, { Numero: '418', Codice: 'FT-2025/0418', Descrizione: 'Provvigione', Importo: '122,00' }),
    ])
    expect(conflitti).toEqual([])
    expect(documenti.length).toBe(2)
    const primo = documenti[0]!
    expect(primo.number).toBe(417)
    expect(primo.items.length).toBe(2)
    expect(primo.items[1]!.quantity).toBe(2)
    expect(primo.lines).toEqual([2, 3])
    expect(documenti[1]!.items.length).toBe(1)
  })

  it('tiene separati fattura e nota di credito con lo stesso numero', () => {
    const { documenti } = raggruppaDocumenti([
      riga(2),
      riga(3, { 'Tipo di documento': 'Nota di credito' }),
    ])
    expect(documenti.length).toBe(2)
    expect(documenti.map((d) => d.kind)).toEqual(['fattura', 'nota_credito'])
  })

  it('tiene separati gli stessi numeri di anni diversi', () => {
    const { documenti } = raggruppaDocumenti([
      riga(2, { 'Data di emissione': '14/11/2025' }),
      riga(3, { 'Data di emissione': '14/11/2024' }),
    ])
    expect(documenti.length).toBe(2)
    expect(documenti.map((d) => d.year).sort()).toEqual([2024, 2025])
  })

  // Una riga con un altro cliente sulla stessa fattura non si attacca: sarebbe
  // un importo intestato a chi non l'ha speso, e nessuno se ne accorgerebbe.
  it('scarta la riga che contraddice l’intestatario', () => {
    const { documenti, conflitti } = raggruppaDocumenti([
      riga(2),
      riga(3, { Cliente: 'Qualcun Altro', Descrizione: 'Altro servizio' }),
    ])
    expect(documenti.length).toBe(1)
    expect(documenti[0]!.items.length).toBe(1)
    expect(conflitti.length).toBe(1)
    expect(conflitti[0]!.line).toBe(3)
    expect(conflitti[0]!.reason).toContain('intestato')
  })

  it('la testata la fissa la prima riga', () => {
    const { documenti } = raggruppaDocumenti([
      riga(2, { Stato: 'Pagata', Scadenza: '14/12/2025' }),
      riga(3, { Stato: 'Da incassare', Scadenza: '31/12/2025', Descrizione: 'Seconda voce' }),
    ])
    expect(documenti.length).toBe(1)
    expect(documenti[0]!.status).toBe('pagata')
    expect(documenti[0]!.due_date).toBe('2025-12-14')
    expect(documenti[0]!.items.length).toBe(2)
  })
})
