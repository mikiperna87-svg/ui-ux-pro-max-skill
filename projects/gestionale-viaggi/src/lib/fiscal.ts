/**
 * Controlli sui codici fiscali italiani.
 *
 * Non servono a fare i pignoli: una partita IVA sbagliata di una cifra manda
 * una fattura elettronica allo scarto, e il cliente lo scopre settimane dopo.
 * Qui si verifica la cifra di controllo, non solo la lunghezza.
 */

/** Normalizza: maiuscolo, senza spazi, senza il prefisso IT. */
export function normalizeVatNumber(input: string): string {
  return input.toUpperCase().replace(/\s/g, '').replace(/^IT/, '')
}

/**
 * Partita IVA: 11 cifre, l'ultima è di controllo (algoritmo di Luhn sui pari).
 */
export function isValidVatNumber(input: string): boolean {
  const value = normalizeVatNumber(input)
  if (!/^\d{11}$/.test(value)) return false

  let sum = 0
  for (let index = 0; index < 11; index += 1) {
    const digit = Number(value[index])
    if (index % 2 === 0) {
      sum += digit
    } else {
      const doubled = digit * 2
      sum += doubled > 9 ? doubled - 9 : doubled
    }
  }
  return sum % 10 === 0
}

const ODD_VALUES: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
}

const EVEN_VALUES: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
}

const CHECK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Codice fiscale: 16 caratteri per le persone fisiche (con carattere di
 * controllo finale), 11 cifre per i soggetti che usano la partita IVA.
 */
export function isValidTaxCode(input: string): boolean {
  const value = input.toUpperCase().replace(/\s/g, '')

  // Le persone giuridiche hanno come codice fiscale la partita IVA.
  if (/^\d{11}$/.test(value)) return isValidVatNumber(value)

  if (!/^[A-Z0-9]{16}$/.test(value)) return false

  let sum = 0
  for (let index = 0; index < 15; index += 1) {
    const char = value[index] ?? ''
    // Le posizioni si contano da 1: dispari e pari usano tabelle diverse.
    const table = (index + 1) % 2 === 1 ? ODD_VALUES : EVEN_VALUES
    const weight = table[char]
    if (weight === undefined) return false
    sum += weight
  }

  return CHECK_CHARS[sum % 26] === value[15]
}

/** IBAN: lunghezza per paese e resto 97 (ISO 13616). */
export function isValidIban(input: string): boolean {
  const value = input.toUpperCase().replace(/\s/g, '')
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false

  const rearranged = value.slice(4) + value.slice(0, 4)
  const digits = rearranged
    .split('')
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join('')

  // Il resto si calcola a blocchi: il numero intero eccede i limiti di Number.
  let remainder = 0
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}
