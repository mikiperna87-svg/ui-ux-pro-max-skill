import { z } from 'zod'
import { CONDIZIONI_PAGAMENTO, MODALITA_PAGAMENTO, NATURE_IVA } from '@/lib/sdi/codici'
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
    // --- Fattura elettronica -------------------------------------------------
    payment_method: z
      .enum(MODALITA_PAGAMENTO.map((v) => v.codice) as [string, ...string[]], {
        error: 'Modalità di pagamento non riconosciuta',
      })
      .default('MP05'),
    payment_condition: z
      .enum(CONDIZIONI_PAGAMENTO.map((v) => v.codice) as [string, ...string[]], {
        error: 'Condizione di pagamento non riconosciuta',
      })
      .default('TP02'),
    // Il bollo si applica o non si applica secondo il regime e l'importo, e a
    // deciderlo è chi tiene la contabilità: qui si chiede, non si indovina.
    stamp_duty: amountCents('Bollo'),
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
  // Deroga sulla Natura: vuota vuol dire «quella che discende dal regime».
  // Serve per l'inversione contabile, dove i sottocodici da N6.1 a N6.8
  // cambiano con il tipo di operazione e nessuno si può indovinare.
  vat_nature: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' || value === '—' ? null : (value ?? null)))
    .refine((value) => value === null || NATURE_IVA.some((n) => n.codice === value), {
      message: 'Natura IVA non riconosciuta',
    }),
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

// --- Documento pregresso ------------------------------------------------------
/**
 * Una fattura già emessa dal gestionale di prima.
 *
 * Differisce dalla fattura nata qui su tre punti, e sono i tre che contano. Il
 * numero è obbligatorio e si conserva: una fattura è il suo numero, e se cambia
 * l'estratto conto del cliente non torna con quello del commercialista. Lo
 * stato non può essere «bozza»: il documento esiste già, da qualche parte è già
 * stato consegnato. E il cliente arriva come testo, come in tutte le
 * importazioni, perché nessun gestionale esporta gli identificativi di questo.
 *
 * Ogni riga del file è una riga del documento: più righe con lo stesso numero
 * fanno una fattura sola. Il raggruppamento sta in `raggruppaDocumenti`.
 */
export const legacyInvoiceImportSchema = z.object({
  cliente: z
    .string()
    .trim()
    .min(1, 'Indica il cliente: nome, email, partita IVA o codice fiscale'),
  kind: z.enum(['fattura', 'nota_credito'], {
    error: 'Tipo di documento non valido: ammessi "fattura" e "nota di credito"',
  }),
  // Il numero deve essere un numero: è la colonna su cui il database garantisce
  // l'unicità per agenzia, anno e tipo. Il formato completo del gestionale di
  // prima — «FT-2025/0417» — va nella colonna del codice, dove resta leggibile
  // senza che nessuno debba indovinare quale gruppo di cifre sia il numero.
  number: z
    .string()
    .trim()
    .min(1, 'Il numero del documento è obbligatorio')
    .transform((value) => value.replace(/\s/g, ''))
    .refine((value) => /^\d{1,7}$/.test(value), {
      message:
        'Il numero del documento deve essere solo cifre: scrivi il formato completo nella colonna «Codice»',
    })
    .refine((value) => Number(value) >= 1, { message: 'Il numero del documento parte da 1' })
    .transform((value) => Number(value)),
  issue_date: dataEmissione,
  due_date: optionalDate,
  status: z.enum(['emessa', 'inviata', 'pagata', 'annullata'], {
    error: 'Stato non valido: un documento importato non è una bozza',
  }),
  vat_regime: z.enum(REGIMI, { error: 'Regime IVA non valido' }),
  code: optionalText(40),
  description: z.string().trim().min(2, 'La descrizione della riga è obbligatoria').max(300),
  quantity: intero('Quantità', 1, 1000, 1),
  importo: amountCents('Importo', { obbligatorio: true }),
  costo: amountCents('Costo del viaggio'),
  vat_percent: percentBps('Aliquota IVA'),
  notes: optionalText(2000),
})

export type LegacyInvoiceImportInput = z.infer<typeof legacyInvoiceImportSchema>
