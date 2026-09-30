import { afterEach, describe, expect, it } from 'vitest'
import { codiceCorretto, codiceRegistrazione } from '@/lib/registrazione'

const originale = process.env.CODICE_REGISTRAZIONE

afterEach(() => {
  if (originale === undefined) delete process.env.CODICE_REGISTRAZIONE
  else process.env.CODICE_REGISTRAZIONE = originale
})

describe('codice di registrazione', () => {
  it('senza variabile la registrazione resta aperta', () => {
    delete process.env.CODICE_REGISTRAZIONE
    expect(codiceRegistrazione()).toBeNull()
  })

  it('una variabile di soli spazi vale come assente', () => {
    process.env.CODICE_REGISTRAZIONE = '   '
    expect(codiceRegistrazione()).toBeNull()
  })

  it('legge il codice ignorando gli spazi ai bordi', () => {
    process.env.CODICE_REGISTRAZIONE = '  parola-segreta  '
    expect(codiceRegistrazione()).toBe('parola-segreta')
  })
})

describe('confronto del codice', () => {
  it('accetta il codice giusto', () => {
    expect(codiceCorretto('parola-segreta', 'parola-segreta')).toBe(true)
  })

  it('rifiuta un codice diverso', () => {
    expect(codiceCorretto('parola-segreta', 'parola-sbagliata')).toBe(false)
  })

  it('rifiuta la stringa vuota', () => {
    expect(codiceCorretto('parola-segreta', '')).toBe(false)
  })

  // Il confronto passa da uno sha256 proprio per reggere lunghezze diverse:
  // senza, timingSafeEqual solleverebbe un'eccezione e il modulo esploderebbe
  // invece di dire «codice non valido».
  it('regge un codice di lunghezza diversa senza sollevare', () => {
    expect(() => codiceCorretto('corto', 'molto piu lungo del previsto')).not.toThrow()
    expect(codiceCorretto('corto', 'molto piu lungo del previsto')).toBe(false)
  })

  it('distingue le maiuscole', () => {
    expect(codiceCorretto('Parola', 'parola')).toBe(false)
  })
})
