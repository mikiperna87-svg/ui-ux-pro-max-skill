/**
 * Mattoni di validazione condivisi da tutti i moduli.
 *
 * Stanno qui e non nel modulo che li ha usati per primo perché una partita IVA
 * si scrive allo stesso modo in una scheda cliente e in una riga di fattura:
 * due copie della stessa regola divergono al primo ritocco.
 */
import { z } from 'zod'
import { parseAmountToCents } from '@/lib/money'
import { isValidIban, isValidTaxCode, isValidVatNumber, normalizeVatNumber } from '@/lib/fiscal'

/** Campo di testo facoltativo: la stringa vuota diventa null, non ''. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Massimo ${max} caratteri`)
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value))

export const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value.toLowerCase()))
  .refine((value) => value === null || z.string().email().safeParse(value).success, {
    message: 'Indirizzo email non valido',
  })

export const optionalProvince = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value.toUpperCase()))
  .refine((value) => value === null || /^[A-Z]{2}$/.test(value), {
    message: 'La provincia è la sigla di due lettere',
  })

export const optionalPostalCode = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value))
  .refine((value) => value === null || /^\d{5}$/.test(value), {
    message: 'Il CAP è di cinque cifre',
  })

/**
 * Un'agenzia italiana compra anche all'estero: la partita IVA di un DMC
 * tanzaniano non ha la cifra di controllo italiana.
 *
 * Il criterio è la forma del valore, non un interruttore da spuntare: se
 * sembra italiana (sole cifre, con o senza prefisso IT) la cifra di controllo
 * è obbligatoria, così una cifra saltata viene comunque colta. Altrimenti si
 * accetta come identificativo estero, verificandone solo i caratteri.
 */
const FOREIGN_IDENTIFIER = /^[A-Z0-9][A-Z0-9\-./ ]{2,29}$/

function looksItalianVat(value: string): boolean {
  return /^(IT)?\d{8,13}$/.test(value)
}

export const optionalVatNumber = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return null
    const upper = value.toUpperCase().replace(/\s+/g, ' ')
    return looksItalianVat(upper) ? normalizeVatNumber(upper) : upper
  })
  .refine(
    (value) => {
      if (value === null) return true
      if (/^\d+$/.test(value)) return isValidVatNumber(value)
      return FOREIGN_IDENTIFIER.test(value)
    },
    {
      message: 'Partita IVA non valida: undici cifre per l’Italia, oppure un identificativo estero',
    },
  )

export const optionalTaxCode = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value.toUpperCase().replace(/\s+/g, '')))
  .refine(
    (value) => {
      if (value === null) return true
      // Le due forme italiane (16 caratteri o 11 cifre) devono quadrare;
      // qualunque altra cosa è trattata come codice estero.
      if (/^[A-Z0-9]{16}$/.test(value) || /^\d{11}$/.test(value)) return isValidTaxCode(value)
      return FOREIGN_IDENTIFIER.test(value)
    },
    { message: 'Codice fiscale non valido: controlla i caratteri' },
  )

export const optionalIban = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value.toUpperCase().replace(/\s/g, '')))
  .refine((value) => value === null || isValidIban(value), {
    message: 'IBAN non valido',
  })

export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: 'Data non valida',
  })

/**
 * Casella di spunta di un form HTML: quando non è selezionata la chiave non
 * arriva affatto nel FormData, quindi il campo deve tollerare l'assenza.
 */
export const checkbox = z
  .unknown()
  .optional()
  .transform((value) => value === 'on' || value === 'true' || value === true)

// --- Numeri e denaro ----------------------------------------------------------

/**
 * Importo digitato dall'utente → centesimi interi.
 *
 * La conversione avviene qui, al confine: da questo punto in poi nel sistema
 * non esiste più un prezzo scritto come "1.234,56", esiste 123456. È la
 * traduzione della regola "mai virgola mobile sul denaro" in una sola riga
 * che nessun modulo può aggirare.
 */
export const amountCents = (etichetta: string, { obbligatorio = false } = {}) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value))
    .superRefine((value, ctx) => {
      if (value === null) {
        if (obbligatorio) {
          ctx.addIssue({ code: 'custom', message: `${etichetta}: indica un importo` })
        }
        return
      }
      try {
        parseAmountToCents(value)
      } catch {
        ctx.addIssue({ code: 'custom', message: `${etichetta}: importo non valido` })
      }
    })
    .transform((value) => (value === null ? null : parseAmountToCents(value)))

/** Percentuale digitata come "12,5" → punti base interi (1250). */
export const percentBps = (etichetta: string, max = 100) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? '0' : value.replace(',', '.')))
    .superRefine((value, ctx) => {
      const numero = Number(value)
      if (!Number.isFinite(numero)) {
        ctx.addIssue({ code: 'custom', message: `${etichetta}: indica un numero` })
        return
      }
      if (numero < 0 || numero > max) {
        ctx.addIssue({ code: 'custom', message: `${etichetta}: ammesso fra 0 e ${max}` })
      }
    })
    .transform((value) => Math.round(Number(value) * 100))

export const intero = (etichetta: string, min: number, max: number, predefinito: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? String(predefinito) : value))
    .superRefine((value, ctx) => {
      if (!/^-?\d+$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: `${etichetta}: indica un numero intero` })
        return
      }
      const numero = Number(value)
      if (numero < min || numero > max) {
        ctx.addIssue({ code: 'custom', message: `${etichetta}: ammesso fra ${min} e ${max}` })
      }
    })
    .transform((value) => Number(value))
