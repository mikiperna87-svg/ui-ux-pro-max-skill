'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { fieldErrorsFrom, formValues, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import {
  acceptQuoteSchema,
  copyVariantSchema,
  quoteItemSchema,
  quoteSchema,
  rejectQuoteSchema,
} from '@/lib/validation/preventivi'
import { checkRateLimit, clientIp } from '@/server/rate-limit'
import { requirePermission } from '@/server/session'

/**
 * Una Server Action è un endpoint HTTP. Le azioni della pagina pubblica non
 * hanno nemmeno una sessione da cui partire: l'unica credenziale è il token,
 * e tutto ciò che arriva va controllato qui prima di toccare il database.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

const VARIANTI = ['base', 'consigliata', 'premium'] as const
type Variante = (typeof VARIANTI)[number]

function isVariante(value: unknown): value is Variante {
  return typeof value === 'string' && (VARIANTI as readonly string[]).includes(value)
}

function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  const entries: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

function rpcMessage(error: { message: string; code?: string }, fallback: string): string {
  const pulito = error.message.replace(/^.*?:\s*/, '').trim()
  return pulito.length > 0 && pulito.length < 200 ? pulito : fallback
}

function aggiornaPagine(quoteId?: string) {
  revalidatePath('/preventivi')
  if (quoteId) revalidatePath(`/preventivi/${quoteId}`)
  revalidatePath('/')
}

// =============================================================================
// Preventivo
// =============================================================================

export async function saveQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = quoteSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const payload = { ...parsed.data, agency_id: session.agency.id }

  if (isUuid(id)) {
    const { error } = await supabase.from('quotes').update(payload).eq('id', id)
    if (error) {
      return {
        status: 'error',
        message: 'Non siamo riusciti a salvare il preventivo.',
        values: formValues(formData),
      }
    }
    aggiornaPagine(id)
    redirect(`/preventivi/${id}`)
  }

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      ...payload,
      owner_id: payload.owner_id ?? session.membership.id,
      created_by: session.user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a creare il preventivo.',
      values: formValues(formData),
    }
  }

  aggiornaPagine(data.id)
  redirect(`/preventivi/${data.id}`)
}

export async function deleteQuotesAction(ids: unknown): Promise<ActionState> {
  await requirePermission('write')

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isUuid)) {
    return { status: 'error', message: 'Nessun preventivo valido selezionato.' }
  }

  const supabase = await createClient()

  // Un preventivo diventato pratica non si elimina: la pratica lo cita, e
  // toglierlo lascerebbe un riferimento a vuoto in contabilità.
  const { count } = await supabase
    .from('quotes')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .not('converted_booking_id', 'is', null)

  if ((count ?? 0) > 0) {
    return {
      status: 'error',
      message: 'I preventivi già convertiti in pratica non si eliminano.',
    }
  }

  const { error } = await supabase
    .from('quotes')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)

  if (error) return { status: 'error', message: 'Non siamo riusciti a eliminare i preventivi.' }

  aggiornaPagine()
  return {
    status: 'success',
    message: ids.length === 1 ? 'Preventivo eliminato.' : `${ids.length} preventivi eliminati.`,
  }
}

/**
 * Marca il preventivo come inviato.
 *
 * L'email arriva con la fase 8: qui si registra il momento in cui l'offerta
 * diventa pubblica, che è ciò da cui dipendono la validità e l'accettazione.
 */
export async function markQuoteSentAction(quoteId: unknown): Promise<ActionState> {
  const session = await requirePermission('write')

  if (!isUuid(quoteId)) return { status: 'error', message: 'Preventivo non valido.' }

  const supabase = await createClient()
  const { data: quote, error: erroreLettura } = await supabase
    .from('quote_list')
    .select('code, status, items_count')
    .eq('id', quoteId)
    .maybeSingle()

  if (erroreLettura || !quote) {
    return { status: 'error', message: 'Preventivo non trovato.' }
  }
  if ((quote.items_count ?? 0) === 0) {
    return {
      status: 'error',
      message: 'Prima di inviare, aggiungi almeno una riga a una delle proposte.',
    }
  }

  const { error } = await supabase
    .from('quotes')
    .update({
      status: 'inviato',
      sent_at: new Date().toISOString(),
    })
    .eq('id', quoteId)
    .in('status', ['bozza', 'inviato'])

  if (error) return { status: 'error', message: 'Non siamo riusciti a segnare l’invio.' }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'cambio_stato',
    p_entity_type: 'quotes',
    p_entity_id: quoteId,
    p_entity_label: quote.code ?? '',
    p_summary: 'Preventivo inviato al cliente',
  })

  aggiornaPagine(quoteId)
  return { status: 'success', message: 'Preventivo segnato come inviato: il collegamento è attivo.' }
}

export async function convertQuoteAction(
  quoteId: unknown,
  variant: unknown,
): Promise<ActionState> {
  await requirePermission('write')

  if (!isUuid(quoteId)) return { status: 'error', message: 'Preventivo non valido.' }
  if (variant !== undefined && variant !== null && !isVariante(variant)) {
    return { status: 'error', message: 'Proposta non valida.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('convert_quote_to_booking', {
    p_quote_id: quoteId,
    p_variant: (variant ?? null) as Variante | null,
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a convertire il preventivo.'),
    }
  }

  aggiornaPagine(quoteId)
  revalidatePath('/pratiche')

  const pratica = Array.isArray(data) ? data[0] : data
  const codice =
    pratica && typeof pratica === 'object' && 'code' in pratica ? String(pratica.code) : ''

  return {
    status: 'success',
    message: codice === '' ? 'Pratica creata dal preventivo.' : `Pratica ${codice} creata.`,
  }
}

// =============================================================================
// Righe delle proposte
// =============================================================================

export async function saveQuoteItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = quoteItemSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const {
    quote_id,
    unit_cost,
    unit_price,
    commission_percent,
    commission_override,
    vat_percent,
    ...resto
  } = parsed.data

  const payload = {
    ...resto,
    quote_id,
    unit_cost_cents: unit_cost ?? 0,
    unit_price_cents: unit_price ?? 0,
    commission_bps: commission_percent,
    commission_override_cents: commission_override,
    vat_bps: vat_percent,
  }

  const { error } = isUuid(id)
    ? await supabase.from('quote_items').update(payload).eq('id', id).eq('quote_id', quote_id)
    : await supabase.from('quote_items').insert({ ...payload, agency_id: session.agency.id })

  if (error) {
    return {
      status: 'error',
      message: 'Non siamo riusciti a salvare la riga.',
      values: formValues(formData),
    }
  }

  aggiornaPagine(quote_id)
  return { status: 'success', message: isUuid(id) ? 'Riga aggiornata.' : 'Riga aggiunta.' }
}

export async function deleteQuoteItemAction(
  itemId: unknown,
  quoteId: unknown,
): Promise<ActionState> {
  await requirePermission('write')

  if (!isUuid(itemId) || !isUuid(quoteId)) {
    return { status: 'error', message: 'Riga non valida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('quote_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('quote_id', quoteId)

  if (error) return { status: 'error', message: 'Non siamo riusciti a togliere la riga.' }

  aggiornaPagine(quoteId)
  return { status: 'success', message: 'Riga rimossa.' }
}

/**
 * Copia una proposta in un'altra, con un ritocco percentuale sui prezzi.
 *
 * Costruire la proposta "premium" riga per riga quando cambia solo il livello
 * dei servizi è lavoro inutile: si parte da quella consigliata e si corregge
 * ciò che serve.
 */
export async function copyVariantAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const parsed = copyVariantSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const { data: righe, error: erroreLettura } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', parsed.data.quote_id)
    .eq('variant', parsed.data.from)
    .is('deleted_at', null)
    .order('sort_order')

  if (erroreLettura) {
    return { status: 'error', message: 'Non siamo riusciti a leggere la proposta di partenza.' }
  }
  if (!righe || righe.length === 0) {
    return { status: 'error', message: 'La proposta di partenza non ha righe da copiare.' }
  }

  // Le righe già presenti nella proposta di destinazione vengono sostituite:
  // "copia" deve dare lo stesso risultato se la si preme due volte.
  await supabase
    .from('quote_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('quote_id', parsed.data.quote_id)
    .eq('variant', parsed.data.to)
    .is('deleted_at', null)

  const fattore = 10_000 + parsed.data.adjust_percent

  const { error } = await supabase.from('quote_items').insert(
    righe.map((riga, indice) => ({
      agency_id: session.agency.id,
      quote_id: parsed.data.quote_id,
      variant: parsed.data.to,
      service_type: riga.service_type,
      supplier_id: riga.supplier_id,
      description: riga.description,
      details: riga.details,
      date_from: riga.date_from,
      date_to: riga.date_to,
      quantity: riga.quantity,
      unit_cost_cents: riga.unit_cost_cents,
      // Il ritocco vale sul prezzo, non sul costo: il fornitore chiede quello
      // che chiede, quello che cambia è il margine.
      unit_price_cents: Math.round((riga.unit_price_cents * fattore) / 10_000),
      commission_bps: riga.commission_bps,
      commission_override_cents: riga.commission_override_cents,
      vat_bps: riga.vat_bps,
      vat_regime: riga.vat_regime,
      sort_order: indice,
    })),
  )

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a copiare la proposta.' }
  }

  aggiornaPagine(parsed.data.quote_id)
  return { status: 'success', message: `Proposta copiata: ${righe.length} righe.` }
}

// =============================================================================
// Pagina pubblica: accettazione e rifiuto
// =============================================================================

export async function acceptQuotePublicAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = acceptQuoteSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  // La pagina è pubblica: senza un limite, il collegamento diventa un modo per
  // martellare il database da fuori.
  const consentito = await checkRateLimit({
    action: 'preventivo',
    subject: parsed.data.token,
    limit: 20,
    windowSeconds: 300,
  })
  if (!consentito) {
    return { status: 'error', message: 'Troppi tentativi. Riprova fra qualche minuto.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_quote', {
    p_token: parsed.data.token,
    p_variant: parsed.data.variant,
    p_name: parsed.data.name,
    p_ip: await clientIp(),
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a registrare l’accettazione.'),
      values: formValues(formData),
    }
  }

  revalidatePath(`/preventivo/${parsed.data.token}`)
  revalidatePath('/preventivi')
  return { status: 'success', message: 'Grazie: la sua scelta è stata registrata.' }
}

export async function rejectQuotePublicAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = rejectQuoteSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const consentito = await checkRateLimit({
    action: 'preventivo',
    subject: parsed.data.token,
    limit: 20,
    windowSeconds: 300,
  })
  if (!consentito) {
    return { status: 'error', message: 'Troppi tentativi. Riprova fra qualche minuto.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_quote', {
    p_token: parsed.data.token,
    p_reason: parsed.data.reason,
    p_ip: await clientIp(),
  })

  if (error) {
    return {
      status: 'error',
      message: rpcMessage(error, 'Non siamo riusciti a registrare la risposta.'),
      values: formValues(formData),
    }
  }

  revalidatePath(`/preventivo/${parsed.data.token}`)
  revalidatePath('/preventivi')
  return { status: 'success', message: 'Risposta registrata. Grazie per averci avvisato.' }
}

/**
 * L'indirizzo pubblico del preventivo, da copiare e mandare al cliente.
 *
 * Il token si legge qui e non arriva dalla pagina: resta fuori dall'HTML della
 * scheda finché qualcuno non chiede davvero il collegamento.
 */
export async function quotePublicUrlAction(quoteId: unknown): Promise<ActionState> {
  await requirePermission('write')

  if (!isUuid(quoteId)) return { status: 'error', message: 'Preventivo non valido.' }

  const supabase = await createClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('public_token, status')
    .eq('id', quoteId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!quote) return { status: 'error', message: 'Preventivo non trovato.' }
  if (quote.status === 'bozza') {
    return {
      status: 'error',
      message: 'Il collegamento si attiva quando il preventivo viene segnato come inviato.',
    }
  }

  const token = quote.public_token
  const intestazioni = await headers()
  const host = intestazioni.get('x-forwarded-host') ?? intestazioni.get('host') ?? ''
  const protocollo = intestazioni.get('x-forwarded-proto') ?? 'https'
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? (host === '' ? '' : `${protocollo}://${host}`)

  return { status: 'success', message: `${base}/preventivo/${token}` }
}
