import { z } from 'zod'
import { fromDateTimeInput } from '@/lib/date'
import { optionalText } from '@/lib/validation/comune'

const TIPI = [
  'verifica_documenti',
  'scadenza_acconto',
  'scadenza_saldo',
  'pagamento_fornitore',
  'richiamo_cliente',
  'generico',
] as const

const PRIORITA = ['bassa', 'media', 'alta', 'urgente'] as const
const STATI = ['aperto', 'in_corso', 'completato', 'annullato'] as const

/** Riferimento facoltativo a un'altra entità: la stringa vuota è "nessuno". */
const riferimento = (etichetta: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value === undefined || value === '' || value === 'nessuno' ? null : value,
    )
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
      message: `${etichetta} non valido`,
    })

/**
 * La scadenza di un'attività è un istante, non un giorno: "richiamare il
 * cliente entro le 18" è un'informazione diversa da "entro oggi". Il campo
 * arriva nella forma locale del browser e viene convertito nel fuso
 * dell'agenzia, non in quello del computer che ha aperto la pagina.
 */
const scadenza = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value))
  .superRefine((value, ctx) => {
    if (value !== null && fromDateTimeInput(value) === null) {
      ctx.addIssue({ code: 'custom', message: 'Data e ora non valide' })
    }
  })
  .transform((value) => (value === null ? null : fromDateTimeInput(value)))

export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Scrivi che cosa c’è da fare')
    .max(200, 'Massimo 200 caratteri'),
  description: optionalText(2000),
  kind: z.enum(TIPI, { error: 'Tipo di attività non valido' }).default('generico'),
  priority: z.enum(PRIORITA, { error: 'Priorità non valida' }).default('media'),
  status: z.enum(STATI, { error: 'Stato non valido' }).default('aperto'),
  due_at: scadenza,
  assignee_id: riferimento('Assegnatario'),
  booking_id: riferimento('Pratica'),
  customer_id: riferimento('Cliente'),
})

export type TaskInput = z.infer<typeof taskSchema>
