import { z } from 'zod'
import {
  amountCents,
  intero,
  optionalDate,
  optionalText,
  percentBps,
} from '@/lib/validation/comune'

const VARIANTI = ['base', 'consigliata', 'premium'] as const

const SERVIZI = [
  'volo',
  'hotel',
  'transfer',
  'assicurazione',
  'escursione',
  'biglietteria',
  'noleggio',
  'visto',
  'pacchetto',
  'altro',
] as const

const uuidFacoltativo = (messaggio: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value === undefined || value === '' || value === 'nessuno' ? null : value,
    )
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: messaggio,
    })

// --- Preventivo ---------------------------------------------------------------
export const quoteSchema = z
  .object({
    customer_id: uuidFacoltativo('Cliente non valido'),
    owner_id: uuidFacoltativo('Operatore non valido'),
    title: z.string().trim().min(2, 'Il titolo è obbligatorio').max(200),
    destination: z.string().trim().min(2, 'La destinazione è obbligatoria').max(160),
    departure_date: optionalDate,
    return_date: optionalDate,
    pax_count: intero('Numero di passeggeri', 1, 500, 2),
    sale_type: z.enum(['intermediazione', 'organizzazione'], {
      error: 'Tipo di vendita non valido',
    }),
    valid_until: optionalDate,
    intro_text: optionalText(4000),
    terms_text: optionalText(6000),
    notes: optionalText(4000),
  })
  .refine(
    (data) =>
      data.departure_date === null ||
      data.return_date === null ||
      data.return_date >= data.departure_date,
    { message: 'Il rientro non può precedere la partenza', path: ['return_date'] },
  )

export type QuoteInput = z.infer<typeof quoteSchema>

// --- Riga di una proposta -----------------------------------------------------
export const quoteItemSchema = z
  .object({
    quote_id: z.string().uuid(),
    variant: z.enum(VARIANTI, { error: 'Proposta non valida' }),
    service_type: z.enum(SERVIZI, { error: 'Tipo di servizio non valido' }),
    supplier_id: uuidFacoltativo('Fornitore non valido'),
    description: z.string().trim().min(2, 'La descrizione è obbligatoria').max(300),
    details: optionalText(2000),
    date_from: optionalDate,
    date_to: optionalDate,
    quantity: intero('Quantità', 1, 1000, 1),
    unit_cost: amountCents('Costo netto'),
    unit_price: amountCents('Prezzo di vendita'),
    commission_percent: percentBps('Commissione'),
    commission_override: amountCents('Commissione forzata'),
    vat_percent: percentBps('Aliquota IVA'),
    vat_regime: z.enum(
      ['ordinaria', 'art_74_ter', 'esente_art_10', 'fuori_campo', 'reverse_charge'],
      { error: 'Regime IVA non valido' },
    ),
    sort_order: intero('Ordine', 0, 9999, 0),
  })
  .refine(
    (data) => data.date_from === null || data.date_to === null || data.date_to >= data.date_from,
    { message: 'La data finale non può precedere quella iniziale', path: ['date_to'] },
  )

export type QuoteItemInput = z.infer<typeof quoteItemSchema>

// --- Copia di una proposta ----------------------------------------------------
export const copyVariantSchema = z
  .object({
    quote_id: z.string().uuid(),
    from: z.enum(VARIANTI, { error: 'Proposta di partenza non valida' }),
    to: z.enum(VARIANTI, { error: 'Proposta di destinazione non valida' }),
    /** Ritocco percentuale applicato ai prezzi copiati, per esempio "15". */
    adjust_percent: percentBps('Ritocco', 200),
  })
  .refine((data) => data.from !== data.to, {
    message: 'Scegli due proposte diverse',
    path: ['to'],
  })

// --- Pagina pubblica ----------------------------------------------------------
const TOKEN = z.string().uuid('Collegamento non valido')

export const acceptQuoteSchema = z.object({
  token: TOKEN,
  variant: z.enum(VARIANTI, { error: 'Scegli una delle proposte' }),
  name: z
    .string()
    .trim()
    .min(2, 'Scrivi il tuo nome e cognome')
    .max(120, 'Il nome è troppo lungo'),
})

export const rejectQuoteSchema = z.object({
  token: TOKEN,
  reason: optionalText(500),
})
