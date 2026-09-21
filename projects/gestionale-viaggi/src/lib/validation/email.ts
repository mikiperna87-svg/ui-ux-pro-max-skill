import { z } from 'zod'
import { checkbox, optionalEmail, optionalText } from '@/lib/validation/comune'

/**
 * Un indirizzo di destinazione è obbligatorio e deve essere scritto bene: un
 * messaggio spedito a "mario.rossi@gmail" non torna indietro con un avviso,
 * semplicemente non arriva.
 */
const destinatario = z
  .string()
  .trim()
  .min(1, 'Indica l’indirizzo del destinatario')
  .toLowerCase()
  .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
    message: 'Indirizzo email non valido',
  })

/** Il messaggio scritto a mano che precede il testo del modello. */
const testoLibero = optionalText(1500)

export const invioPreventivoSchema = z.object({
  quote_id: z.string().uuid('Preventivo non valido'),
  to: destinatario,
  message: testoLibero,
})

export const invioFatturaSchema = z.object({
  invoice_id: z.string().uuid('Documento non valido'),
  to: destinatario,
  allega_pdf: checkbox,
})

export const promemoriaSchema = z.object({
  booking_id: z.string().uuid('Pratica non valida'),
  installment_id: z.string().uuid('Scadenza non valida'),
  to: destinatario,
  message: testoLibero,
})

export const provaEmailSchema = z.object({
  to: destinatario,
})

export const impostazioniEmailSchema = z.object({
  email_enabled: checkbox,
  email_from_name: optionalText(80),
  email_reply_to: optionalEmail,
  email_signature: optionalText(500),
})

export type InvioPreventivoInput = z.infer<typeof invioPreventivoSchema>
export type InvioFatturaInput = z.infer<typeof invioFatturaSchema>
export type PromemoriaInput = z.infer<typeof promemoriaSchema>
export type ImpostazioniEmailInput = z.infer<typeof impostazioniEmailSchema>
