import { z } from 'zod'
import { isValidVatNumber } from '@/lib/fiscal'
import { ROLES } from '@/lib/roles'
import { REGIMI_FISCALI } from '@/lib/sdi/codici'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? null : (value ?? null)))

export const agencySchema = z.object({
  name: z.string().trim().min(2, 'Il nome è obbligatorio').max(120),
  legal_name: optionalText(160),
  // La cifra di controllo, non solo le undici cifre: e' questa la partita IVA
  // che finisce nel file della fattura elettronica, ed e' l'unica che non
  // veniva verificata davvero.
  vat_number: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null)))
    .refine((value) => value === null || isValidVatNumber(value), {
      message: 'Partita IVA non valida: undici cifre con la cifra di controllo giusta',
    }),
  tax_code: optionalText(16),
  rea_number: optionalText(32),
  address_line: optionalText(160),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Il CAP è di 5 cifre')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
  city: optionalText(80),
  province: z
    .string()
    .trim()
    .length(2, 'La provincia è di 2 lettere')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value?.toUpperCase() ?? null)),
  email: z.string().trim().email('Email non valida').optional().or(z.literal('')).transform((v) => (v === '' ? null : v ?? null)),
  pec: z.string().trim().email('PEC non valida').optional().or(z.literal('')).transform((v) => (v === '' ? null : v ?? null)),
  phone: optionalText(40),
  website: z.string().trim().url('Indirizzo non valido').optional().or(z.literal('')).transform((v) => (v === '' ? null : v ?? null)),
  iban: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i, 'IBAN non valido')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value?.toUpperCase() ?? null)),
  license_number: optionalText(64),
  insurance_policy: optionalText(120),

  // --- Fattura elettronica ---------------------------------------------------
  sdi_regime: z
    .enum(REGIMI_FISCALI.map((r) => r.codice) as [string, ...string[]], {
      error: 'Regime fiscale non riconosciuto',
    })
    .default('RF01'),
  rea_office: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value?.toUpperCase() ?? null)))
    .refine((value) => value === null || /^[A-Z]{2}$/.test(value), {
      message: 'L’ufficio REA è la sigla della provincia, due lettere',
    }),
  share_capital: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => {
      if (!value) return null
      const numero = Number(value.replace(/\./g, '').replace(',', '.'))
      return Number.isFinite(numero) ? Math.round(numero * 100) : Number.NaN
    })
    .refine((value) => value === null || (Number.isInteger(value) && value >= 0), {
      message: 'Il capitale sociale non è un importo valido',
    }),
  sole_shareholder: z
    .union([z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
  in_liquidation: z
    .union([z.literal('on'), z.literal('true'), z.literal('')])
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
})

/**
 * L’utente ragiona in percentuali ("acconto 30%"), il database in punti base.
 * La conversione avviene qui, una volta sola, così' non compare nei componenti.
 */
export const settingsSchema = z
  .object({
    deposit_due_days: z.coerce.number().int().min(0, 'Minimo 0 giorni').max(90, 'Massimo 90 giorni'),
    balance_due_days_before_departure: z.coerce.number().int().min(0).max(365),
    deposit_percent: z.coerce.number().min(0, 'Minimo 0%').max(100, 'Massimo 100%'),
    passenger_document_alert_days: z.coerce.number().int().min(0).max(365),
    default_vat_percent: z.coerce.number().min(0, 'Minimo 0%').max(100, 'Massimo 100%'),
    quote_validity_days: z.coerce.number().int().min(1).max(365),
    booking_number_prefix: z.string().trim().max(8),
    quote_number_prefix: z.string().trim().max(8),
    invoice_number_prefix: z.string().trim().max(8),
    credit_note_number_prefix: z.string().trim().max(8),
    hide_margins_from_operators: z.coerce.boolean(),
  })
  .transform(({ deposit_percent, default_vat_percent, ...rest }) => ({
    ...rest,
    deposit_percent_bps: Math.round(deposit_percent * 100),
    default_vat_bps: Math.round(default_vat_percent * 100),
  }))

export const inviteSchema = z.object({
  email: z.string().trim().email('Email non valida').transform((value) => value.toLowerCase()),
  full_name: z.string().trim().min(2, 'Inserisci nome e cognome').max(120),
  role: z.enum(ROLES as unknown as [string, ...string[]]),
  job_title: z.string().trim().max(80).optional(),
})

export const memberUpdateSchema = z.object({
  membership_id: z.string().uuid(),
  role: z.enum(ROLES as unknown as [string, ...string[]]),
  is_active: z.coerce.boolean(),
})
