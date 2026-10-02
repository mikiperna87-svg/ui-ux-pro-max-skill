import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isValidIban, isValidVatNumber } from '@/lib/fiscal'

/**
 * I dati della demo devono superare i controlli dell'applicazione.
 *
 * Un IBAN o una partita IVA inventati a mano passano l'inserimento del seed —
 * il database non ne verifica la cifra di controllo — ma non passano il form:
 * chi apre quel fornitore nella demo e salva una qualunque modifica si vede
 * rifiutare un campo che non ha toccato. È già capitato con nove IBAN su dieci.
 */
const seed = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8')

const unici = (valori: readonly string[]) => [...new Set(valori)]

describe('seed dimostrativo', () => {
  it('ha IBAN con la cifra di controllo giusta', () => {
    const iban = unici([...seed.matchAll(/'(IT\d{2}[A-Z][0-9A-Z]{22})'/g)].map((m) => m[1] ?? ''))
    expect(iban.length).toBeGreaterThan(0)
    for (const valore of iban) expect(isValidIban(valore), valore).toBe(true)
  })

  it('ha partite IVA valide', () => {
    const partite = unici([...seed.matchAll(/'(IT\d{11})'/g)].map((m) => m[1] ?? ''))
    expect(partite.length).toBeGreaterThan(0)
    for (const valore of partite) expect(isValidVatNumber(valore), valore).toBe(true)
  })

  // I codici fiscali dei clienti dimostrativi non sono scritti nel seed: li
  // compone `app.tax_code_with_checksum` riga per riga, con il carattere di
  // controllo calcolato dal database. Qui si verifica che quella funzione sia
  // ancora quella usata, perché un seed che torna ai codici scritti a mano
  // rimetterebbe in archivio dati che il form rifiuta.
  it('calcola i codici fiscali invece di scriverli a mano', () => {
    expect(seed).toContain('app.tax_code_with_checksum(')
    expect(seed).toContain('app.vat_number_with_checksum(')
    expect([...seed.matchAll(/'[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]'/g)].length).toBe(0)
  })
})
