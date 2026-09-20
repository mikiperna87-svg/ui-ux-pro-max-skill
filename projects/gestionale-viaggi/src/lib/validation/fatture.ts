import { z } from 'zod'
import {
  amountCents,
  intero,
  optionalDate,
  optionalText,
  percentBps,
} from '@/lib/validation/comune'

const REGIMI = [
  'ordinaria',
  'art_74_ter',
  'esente_art_10',
  'fuori_campo',
  'reverse_charge',
] as const

const oggiIso = () => new Date().toISOString().slice(0, 10)

/**
 * La data di emissione non può essere nel futuro: un documento fiscale si
 * numera quando esiste, e datarlo avanti romperebbe l'ordine della numerazione.
 */
const dataEmissione = z
  .string()
  .trim()
  .min(1, 'Indica la data di emissione')
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Data non valida' })
  .refine((value) => value <= oggiIso(), {
    message: 'La data di emissione non può essere nel futuro',
  })

// --- Testata del documento ----------------------------------------------------
export const invoiceSchema = z
  .object({
    customer_id: z.string().uuid('Indica il cliente intestatario'),
    booking_id: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value === undefined || value === '' || value === 'nessuna' ? null : value,
      )
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
        message: 'Pratica non valida',
      }),
    issue_date: dataEmissione,
    due_date: optionalDate,
    vat_regime: z.enum(REGIMI, { error: 'Regime IVA non valido' }),
    payment_terms: optionalText(300),
    notes: optionalText(2000),
    legal_notes: optionalText(2000),
  })
  .refine(
    (data) => data.due_date === null || data.due_date >= data.issue_date,
    { message: 'La scadenza non può precedere l’emissione', path: ['due_date'] },
  )

export type InvoiceInput = z.infer<typeof invoiceSchema>

// --- Riga del documento -------------------------------------------------------
export const invoiceItemSchema = z.object({
  invoice_id: z.string().uuid(),
  description: z.string().trim().min(2, 'La descrizione è obbligatoria').max(300),
  quantity: intero('Quantità', 1, 1000, 1),
  unit_price: amountCents('Importo'),
  // Nel 74-ter il costo del viaggio non è un dettaglio interno: è ciò da cui si
  // ricava il margine, e quindi l'imponibile. Va chiesto insieme al prezzo.
  cost: amountCents('Costo del viaggio'),
  vat_percent: percentBps('Aliquota IVA'),
  vat_regime: z.enum(REGIMI, { error: 'Regime IVA non valido' }),
  sort_order: intero('Ordine', 0, 9999, 0),
})

export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>

// --- Operazioni ---------------------------------------------------------------
export const issueInvoiceSchema = z.object({
  id: z.string().uuid(),
  issue_date: dataEmissione,
})

export const creditNoteSchema = z.object({
  invoice_id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, 'Scrivi il motivo dello storno')
    .max(500, 'Il motivo è troppo lungo'),
})
