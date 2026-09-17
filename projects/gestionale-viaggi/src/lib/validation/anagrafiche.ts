import { z } from 'zod'
import {
  checkbox,
  optionalDate,
  optionalEmail,
  optionalIban,
  optionalPostalCode,
  optionalProvince,
  optionalTaxCode,
  optionalText,
  optionalVatNumber,
} from '@/lib/validation/comune'

// --- Clienti ------------------------------------------------------------------
export const customerSchema = z
  .object({
    kind: z.enum(['privato', 'azienda'], {
      error: 'Tipo di cliente non valido: ammessi "privato" e "azienda"',
    }),
    first_name: optionalText(80),
    last_name: optionalText(80),
    company_name: optionalText(160),
    vat_number: optionalVatNumber,
    tax_code: optionalTaxCode,
    sdi_code: optionalText(7),
    pec: optionalEmail,
    email: optionalEmail,
    phone: optionalText(40),
    mobile: optionalText(40),
    address_line: optionalText(160),
    postal_code: optionalPostalCode,
    city: optionalText(80),
    province: optionalProvince,
    country: z.string().trim().length(2, 'Il paese si indica con due lettere').default('IT'),
    birth_date: optionalDate,
    birth_place: optionalText(80),
    preferred_contact: optionalText(20),
    notes: optionalText(2000),
    /** Elenco separato da virgole nel form, array sul database. */
    tags: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value === undefined || value === ''
          ? []
          : [...new Set(value.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      ),
    privacy_consent: checkbox,
    marketing_consent: checkbox,
    profiling_consent: checkbox,
  })
  .refine(
    (data) =>
      data.kind === 'azienda'
        ? data.company_name !== null
        : data.first_name !== null || data.last_name !== null,
    {
      message: 'Per un privato serve almeno il cognome, per un azienda la ragione sociale',
      path: ['last_name'],
    },
  )

export type CustomerInput = z.infer<typeof customerSchema>

// --- Passeggeri ---------------------------------------------------------------
export const passengerSchema = z
  .object({
    customer_id: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' || value === 'nessuno' ? null : value))
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
        message: 'Cliente non valido',
      }),
    first_name: z.string().trim().min(1, 'Il nome è obbligatorio').max(80),
    last_name: z.string().trim().min(1, 'Il cognome è obbligatorio').max(80),
    birth_date: optionalDate,
    birth_place: optionalText(80),
    gender: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' || value === 'non_indicato' ? null : value))
      .refine((value) => value === null || ['M', 'F', 'X'].includes(value), {
        message: 'Valore non ammesso',
      }),
    nationality: z.string().trim().length(2, 'La nazionalità si indica con due lettere').default('IT'),
    tax_code: optionalTaxCode,
    email: optionalEmail,
    phone: optionalText(40),
    document_type: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' || value === 'nessuno' ? null : value))
      .refine(
        (value) =>
          value === null ||
          ['carta_identita', 'passaporto', 'patente', 'permesso_soggiorno'].includes(value),
        { message: 'Tipo di documento non ammesso' },
      ),
    document_number: optionalText(40),
    document_issued_at: optionalDate,
    document_expires_at: optionalDate,
    document_issuer: optionalText(120),
    dietary_needs: optionalText(300),
    special_needs: optionalText(300),
    frequent_flyer: optionalText(60),
    notes: optionalText(2000),
  })
  .refine(
    (data) =>
      data.document_issued_at === null ||
      data.document_expires_at === null ||
      data.document_expires_at >= data.document_issued_at,
    {
      message: 'La scadenza non può precedere il rilascio',
      path: ['document_expires_at'],
    },
  )
  .refine((data) => data.document_type === null || data.document_number !== null, {
    message: 'Indica il numero del documento',
    path: ['document_number'],
  })

export type PassengerInput = z.infer<typeof passengerSchema>

// --- Fornitori ----------------------------------------------------------------
export const supplierSchema = z.object({
  kind: z.enum([
    'tour_operator',
    'compagnia_aerea',
    'compagnia_ferroviaria',
    'compagnia_marittima',
    'hotel',
    'dmc',
    'assicurazione',
    'noleggio',
    'altro',
  ], { error: 'Tipo di fornitore non valido' }),
  name: z.string().trim().min(2, 'Il nome è obbligatorio').max(160),
  legal_name: optionalText(160),
  vat_number: optionalVatNumber,
  tax_code: optionalTaxCode,
  email: optionalEmail,
  pec: optionalEmail,
  phone: optionalText(40),
  contact_name: optionalText(120),
  address_line: optionalText(160),
  postal_code: optionalPostalCode,
  city: optionalText(80),
  province: optionalProvince,
  country: z.string().trim().length(2, 'Il paese si indica con due lettere').default('IT'),
  iban: optionalIban,
  payment_terms_days: z.coerce
    .number({ error: 'Indica i giorni di pagamento come numero' })
    .int('Indica un numero intero di giorni')
    .min(0, 'Minimo 0 giorni')
    .max(365, 'Massimo 365 giorni'),
  default_commission_percent: z.coerce
    .number({ error: 'Indica la commissione come numero' })
    .min(0, 'Minimo 0%')
    .max(100, 'Massimo 100%'),
  default_vat_regime: z.enum([
    'ordinaria',
    'art_74_ter',
    'esente_art_10',
    'fuori_campo',
    'reverse_charge',
  ], { error: 'Regime IVA non valido' }),
  booking_portal_url: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value))
    .refine((value) => value === null || z.string().url().safeParse(value).success, {
      message: 'Indirizzo non valido',
    }),
  notes: optionalText(2000),
  is_active: checkbox,
})

export type SupplierInput = z.infer<typeof supplierSchema>
