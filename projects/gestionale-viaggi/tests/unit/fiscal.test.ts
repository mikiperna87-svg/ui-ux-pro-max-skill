import { describe, expect, it } from 'vitest'
import { isValidIban, isValidTaxCode, isValidVatNumber, normalizeVatNumber } from '@/lib/fiscal'

describe('partita IVA', () => {
  it('accetta una partita IVA con cifra di controllo corretta', () => {
    // Cifra di controllo verificata con l'algoritmo ufficiale
    expect(isValidVatNumber('00743110157')).toBe(true)
    expect(isValidVatNumber('IT00743110157')).toBe(true)
    expect(isValidVatNumber('IT 00743110157')).toBe(true)
  })

  it('rifiuta una cifra di controllo sbagliata', () => {
    expect(isValidVatNumber('00743110158')).toBe(false)
  })

  it('rifiuta lunghezze diverse da undici cifre', () => {
    expect(isValidVatNumber('0074311015')).toBe(false)
    expect(isValidVatNumber('007431101577')).toBe(false)
    expect(isValidVatNumber('abcdefghijk')).toBe(false)
    expect(isValidVatNumber('')).toBe(false)
  })

  it('normalizza togliendo prefisso e spazi', () => {
    expect(normalizeVatNumber(' it 007 431 10157 ')).toBe('00743110157')
  })
})

describe('codice fiscale', () => {
  it('accetta un codice di persona fisica con carattere di controllo corretto', () => {
    expect(isValidTaxCode('RSSMRA85T10A562S')).toBe(true)
    expect(isValidTaxCode('rssmra85t10a562s')).toBe(true)
  })

  it('rifiuta un carattere di controllo sbagliato', () => {
    expect(isValidTaxCode('RSSMRA85T10A562A')).toBe(false)
  })

  it('accetta la partita IVA come codice fiscale di un ente', () => {
    expect(isValidTaxCode('00743110157')).toBe(true)
    expect(isValidTaxCode('00743110158')).toBe(false)
  })

  it('rifiuta lunghezze e caratteri non ammessi', () => {
    expect(isValidTaxCode('RSSMRA85T10A562')).toBe(false)
    expect(isValidTaxCode('RSSMRA85T10A562-')).toBe(false)
    expect(isValidTaxCode('')).toBe(false)
  })
})

describe('IBAN', () => {
  it('accetta IBAN validi, anche con spazi', () => {
    expect(isValidIban('IT60X0542811101000000123456')).toBe(true)
    expect(isValidIban('IT60 X054 2811 1010 0000 0123 456')).toBe(true)
    expect(isValidIban('DE89370400440532013000')).toBe(true)
  })

  it('rifiuta un IBAN con una cifra alterata', () => {
    expect(isValidIban('IT60X0542811101000000123457')).toBe(false)
    expect(isValidIban('IT61X0542811101000000123456')).toBe(false)
  })

  it('rifiuta formati impossibili', () => {
    expect(isValidIban('12345')).toBe(false)
    expect(isValidIban('ITXX0542811101000000123456')).toBe(false)
  })
})
