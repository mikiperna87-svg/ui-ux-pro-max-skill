import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import { publicEnv, serverEnv } from '@/lib/env'
import { verificaFirma } from '@/lib/webhook-firma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * L'endpoint che il fornitore di pagamenti chiama quando un abbonamento
 * cambia.
 *
 * Non parla con nessun fornitore in particolare: accetta un corpo documentato
 * e una firma HMAC. L'adattatore che traduce gli eventi di *quel* fornitore in
 * questo corpo si scrive quando il fornitore è scelto — scriverlo adesso, alla
 * cieca, vorrebbe dire consegnare codice che sembra funzionare.
 *
 * Usa la chiave di servizio perché non c'è nessun utente autenticato: è una
 * macchina che parla a una macchina. Per questo la firma non è un dettaglio —
 * è l'unica cosa che distingue il fornitore da chiunque conosca l'indirizzo.
 */
const corpoSchema = z.object({
  agency_id: z.string().uuid(),
  plan_code: z.string().trim().min(1),
  status: z.enum(['prova', 'attivo', 'scaduto', 'annullato']),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: z.string().trim().max(300).nullable().optional(),
})

export async function POST(request: Request) {
  const segreto = process.env.WEBHOOK_ABBONAMENTI_SECRET ?? ''
  const corpo = await request.text()

  const esito = verificaFirma(corpo, request.headers.get('x-firma'), segreto)
  if (!esito.valida) {
    // Il motivo non torna indietro: a chi prova a indovinare non si spiega
    // dove ha sbagliato.
    console.warn(`[abbonamenti] firma rifiutata: ${esito.motivo}`)
    return new Response('Firma non valida.', { status: 401 })
  }

  let dati: unknown
  try {
    dati = JSON.parse(corpo)
  } catch {
    return new Response('Corpo non leggibile.', { status: 400 })
  }

  const parsed = corpoSchema.safeParse(dati)
  if (!parsed.success) {
    return new Response(`Corpo non valido: ${parsed.error.issues[0]?.message ?? ''}`, {
      status: 400,
    })
  }

  const supabase = createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Una funzione e non un upsert diretto: la scrittura è la stessa che usa il
  // pannello di piattaforma, i controlli sul piano e sull'agenzia stanno lì, e
  // la riga finisce anche nel registro attività dell'agenzia. La funzione è
  // revocata a tutti i ruoli tranne quello di servizio.
  const { error } = await supabase.rpc('set_subscription_as_service', {
    p_agency_id: parsed.data.agency_id,
    p_plan_code: parsed.data.plan_code,
    p_status: parsed.data.status,
    p_valid_until: parsed.data.valid_until ?? null,
    p_note: parsed.data.note ?? null,
  })

  if (error) {
    console.error(`[abbonamenti] aggiornamento fallito: ${error.message}`)
    // Un 5xx dice al fornitore di riprovare; un 4xx gli direbbe di rinunciare.
    return new Response('Aggiornamento non riuscito.', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}
