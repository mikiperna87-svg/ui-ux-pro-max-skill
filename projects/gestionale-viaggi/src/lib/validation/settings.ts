import { z } from 'zod'
import { ROLES } from '@/lib/roles'

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
  vat_number: z
    .string()
    .trim()
    .regex(/^(IT)?\d{11}$/, 'Partita IVA non valida (11 cifre)')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : (value ?? null))),
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
