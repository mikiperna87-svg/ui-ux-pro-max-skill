import { z } from 'zod'
import { amountCents, intero, optionalDate, optionalText } from '@/lib/validation/comune'

const METODI = [
  'contanti',
  'pos',
  'bonifico',
  'assegno',
  'link_pagamento',
  'compensazione',
] as const

const oggiIso = () => new Date().toISOString().slice(0, 10)

/** Data obbligatoria, mai nel futuro: un incasso si registra quando è entrato. */
const dataPassata = (etichetta: string) =>
  z
    .string()
    .trim()
    .min(1, `${etichetta}: indica una data`)
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: `${etichetta}: data non valida`,
    })
    .refine((value) => value <= oggiIso(), {
      message: `${etichetta}: non può essere nel futuro`,
    })

// --- Incasso ------------------------------------------------------------------
export const paymentInSchema = z
  .object({
    booking_id: z.string().uuid(),
    installment_id: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value === undefined || value === '' || value === 'nessuna' ? null : value,
      )
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
        message: 'Scadenza non valida',
      }),
    kind: z.enum(['acconto', 'saldo', 'extra', 'rimborso'], { error: 'Tipo di incasso non valido' }),
    method: z.enum(METODI, { error: 'Metodo di pagamento non valido' }),
    amount: amountCents('Importo', { obbligatorio: true }),
    paid_at: dataPassata('Data dell’incasso'),
    reference: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((data) => data.amount !== null && data.amount !== 0, {
    message: 'L’importo non può essere zero',
    path: ['amount'],
  })
  .refine((data) => data.kind !== 'rimborso' || (data.amount ?? 0) < 0, {
    // Un rimborso è denaro che torna al cliente: in cassa si legge in negativo,
    // altrimenti il totale incassato racconterebbe soldi che non ci sono più.
    message: 'Un rimborso si registra con un importo negativo (es. -150,00)',
    path: ['amount'],
  })
  .refine((data) => data.kind === 'rimborso' || (data.amount ?? 0) > 0, {
    message: 'L’importo dev’essere maggiore di zero',
    path: ['amount'],
  })

export type PaymentInInput = z.infer<typeof paymentInSchema>

export const voidPaymentSchema = z.object({
  payment_id: z.string().uuid(),
  booking_id: z.string().uuid(),
  reason: z.string().trim().min(3, 'Scrivi il motivo dello storno').max(400),
})

// --- Scadenza (rata) ----------------------------------------------------------
export const installmentSchema = z.object({
  id: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Scadenza non valida',
    }),
  booking_id: z.string().uuid(),
  kind: z.enum(['acconto', 'saldo', 'rata'], { error: 'Tipo di scadenza non valido' }),
  due_date: z
    .string()
    .trim()
    .min(1, 'Indica la data di scadenza')
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Data di scadenza non valida' }),
  amount: amountCents('Importo', { obbligatorio: true }),
  sort_order: intero('Ordine', 0, 999, 0),
  notes: optionalText(500),
})

export type InstallmentInput = z.infer<typeof installmentSchema>

// --- Pagamento al fornitore ---------------------------------------------------
export const payoutSchema = z.object({
  id: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: 'Pagamento non valido',
    }),
  booking_id: z.string().uuid(),
  supplier_id: z.string().uuid('Scegli il fornitore'),
  amount: amountCents('Importo', { obbligatorio: true }),
  due_date: z
    .string()
    .trim()
    .min(1, 'Indica la scadenza')
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), { message: 'Scadenza non valida' }),
  method: z.enum(METODI, { error: 'Metodo di pagamento non valido' }),
  supplier_invoice_number: optionalText(80),
  reference: optionalText(120),
  notes: optionalText(2000),
})

export const payoutStatusSchema = z
  .object({
    payout_id: z.string().uuid(),
    status: z.enum(['da_pagare', 'programmato', 'pagato', 'stornato'], {
      error: 'Stato del pagamento non valido',
    }),
    paid_at: optionalDate,
    method: z.enum(METODI).optional(),
    reference: optionalText(120),
    supplier_invoice_number: optionalText(80),
  })
  .refine((data) => data.status !== 'pagato' || (data.paid_at ?? oggiIso()) <= oggiIso(), {
    message: 'La data del pagamento non può essere nel futuro',
    path: ['paid_at'],
  })

export type PayoutStatusInput = z.infer<typeof payoutStatusSchema>
