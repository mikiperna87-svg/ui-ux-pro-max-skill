import { describe, expect, it } from 'vitest'
import {
  csvBoolean,
  csvDateToIso,
  CsvError,
  matchHeader,
  parseCsv,
  toCsv,
} from '@/lib/csv'
import {
  buildRowValues,
  CUSTOMER_IMPORT_FIELDS,
  mapHeaders,
  SUPPLIER_IMPORT_FIELDS,
  type ImportField,
} from '@/lib/import-maps'
import { customerSchema, supplierSchema } from '@/lib/validation/anagrafiche'

describe('parseCsv', () => {
  it('legge un file con la virgola', () => {
    const result = parseCsv('nome,email\nMario,mario@example.it\nGiulia,giulia@example.it')
    expect(result.delimiter).toBe(',')
    expect(result.headers).toEqual(['nome', 'email'])
    expect(result.rows).toEqual([
      { nome: 'Mario', email: 'mario@example.it' },
      { nome: 'Giulia', email: 'giulia@example.it' },
    ])
  })

  it('riconosce il punto e virgola di Excel italiano e il BOM', () => {
    const result = parseCsv('﻿nome;città\nMario;Varese')
    expect(result.delimiter).toBe(';')
    expect(result.headers).toEqual(['nome', 'città'])
    expect(result.rows[0]).toEqual({ nome: 'Mario', città: 'Varese' })
  })

  it('rispetta le virgolette, i separatori interni e i ritorni a capo', () => {
    const csv = 'nome,note\n"Rossi, Mario","Prima riga\nSeconda riga"\n"Con ""virgolette""",ok'
    const result = parseCsv(csv)
    expect(result.rows[0]).toEqual({ nome: 'Rossi, Mario', note: 'Prima riga\nSeconda riga' })
    expect(result.rows[1]).toEqual({ nome: 'Con "virgolette"', note: 'ok' })
  })

  it('ignora le righe completamente vuote', () => {
    const result = parseCsv('nome,email\nMario,m@e.it\n\n\nGiulia,g@e.it\n')
    expect(result.rows).toHaveLength(2)
  })

  it('completa le righe più corte dell intestazione', () => {
    const result = parseCsv('nome,email,città\nMario,m@e.it')
    expect(result.rows[0]).toEqual({ nome: 'Mario', email: 'm@e.it', città: '' })
  })

  it('segnala la riga esatta quando ci sono colonne in più', () => {
    expect(() => parseCsv('a,b\n1,2\n1,2,3')).toThrowError(
      expect.objectContaining({ line: 3 }) as Error,
    )
  })

  it('rifiuta intestazioni duplicate e virgolette aperte', () => {
    expect(() => parseCsv('nome,nome\n1,2')).toThrow(CsvError)
    expect(() => parseCsv('nome\n"non chiusa')).toThrow(/virgolette non chiuse/)
  })

  it('rifiuta un file vuoto', () => {
    expect(() => parseCsv('   ')).toThrow(/vuoto/)
  })
})

describe('matchHeader', () => {
  it('associa le intestazioni ignorando maiuscole, accenti e punteggiatura', () => {
    const headers = ['Partita IVA', 'Città', 'e_mail']
    expect(matchHeader(headers, ['partita_iva', 'piva'])).toBe('Partita IVA')
    expect(matchHeader(headers, ['citta'])).toBe('Città')
    expect(matchHeader(headers, ['email'])).toBe('e_mail')
    expect(matchHeader(headers, ['telefono'])).toBeNull()
  })
})

describe('toCsv', () => {
  it('scrive un file che Excel italiano apre senza domande', () => {
    const output = toCsv(
      [{ nome: 'Rossi; Mario', totale: 1234 }],
      [
        { header: 'Nome', value: (row) => row.nome },
        { header: 'Totale', value: (row) => row.totale },
      ],
    )
    expect(output.startsWith('﻿')).toBe(true)
    expect(output).toContain('Nome;Totale')
    // Il punto e virgola dentro al valore obbliga le virgolette
    expect(output).toContain('"Rossi; Mario";1234')
    expect(output.endsWith('\r\n')).toBe(true)
  })

  it('raddoppia le virgolette nei valori', () => {
    const output = toCsv([{ v: 'con "virgolette"' }], [{ header: 'V', value: (r) => r.v }])
    expect(output).toContain('"con ""virgolette"""')
  })

  it('rende vuote le celle nulle', () => {
    const output = toCsv([{ v: null }], [{ header: 'V', value: (r) => r.v }])
    expect(output).toContain('V\r\n\r\n')
  })
})

describe('conversioni dai fogli di calcolo', () => {
  it('accetta le date nei formati che si incontrano davvero', () => {
    expect(csvDateToIso('14/03/2026')).toBe('2026-03-14')
    expect(csvDateToIso('4.3.2026')).toBe('2026-03-04')
    expect(csvDateToIso('2026-03-14')).toBe('2026-03-14')
    expect(csvDateToIso('')).toBeNull()
    expect(csvDateToIso('marzo 2026')).toBeNull()
  })

  it('interpreta i valori che significano sì', () => {
    expect(csvBoolean('Sì')).toBe(true)
    expect(csvBoolean('X')).toBe(true)
    expect(csvBoolean('1')).toBe(true)
    expect(csvBoolean('no')).toBe(false)
    expect(csvBoolean('')).toBe(false)
  })
})

describe('costruzione delle righe da importare', () => {
  const righeDi = (testo: string, campi: readonly ImportField[]) => {
    const file = parseCsv(testo)
    const mappings = mapHeaders(file.headers, campi)
    return file.rows.map((riga) => buildRowValues(riga, campi, mappings))
  }

  it('deduce il tipo di cliente quando la colonna manca', () => {
    const righe = righeDi(
      ['Cognome;Nome;Email', 'Rossi;Mario;mario@example.it'].join('\n'),
      CUSTOMER_IMPORT_FIELDS,
    )
    expect(righe[0]?.kind).toBe('privato')
    expect(customerSchema.safeParse(righe[0]).success).toBe(true)
  })

  it('riconosce un elenco di sole aziende senza colonna Tipo', () => {
    const righe = righeDi(
      ['Ragione sociale;Email', 'Orizzonti Srl;info@orizzonti.it'].join('\n'),
      CUSTOMER_IMPORT_FIELDS,
    )
    expect(righe[0]?.kind).toBe('azienda')
    expect(customerSchema.safeParse(righe[0]).success).toBe(true)
  })

  it('riempie le condizioni commerciali mancanti di un fornitore', () => {
    const righe = righeDi(['Nome;Email', 'Alpitour;booking@alpitour.it'].join('\n'), SUPPLIER_IMPORT_FIELDS)
    expect(righe[0]).toMatchObject({
      kind: 'altro',
      payment_terms_days: 30,
      default_commission_percent: 0,
      default_vat_regime: 'art_74_ter',
    })
    expect(supplierSchema.safeParse(righe[0]).success).toBe(true)
  })

  it('la colonna presente ha comunque la precedenza sul ripiego', () => {
    const righe = righeDi(
      ['Nome;Tipo;Dilazione', 'Emirates;Compagnia aerea;60'].join('\n'),
      SUPPLIER_IMPORT_FIELDS,
    )
    expect(righe[0]).toMatchObject({ kind: 'compagnia_aerea', payment_terms_days: '60' })
  })

  it('non lascia passare messaggi di errore in inglese', () => {
    const esito = customerSchema.safeParse({ kind: 'ditta individuale', last_name: 'Rossi' })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.message).toBe(
      'Tipo di cliente non valido: ammessi "privato" e "azienda"',
    )
  })
})
