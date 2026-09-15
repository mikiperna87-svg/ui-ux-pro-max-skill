'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  fieldErrorsFrom,
  formValues,
  type ActionState,
  type ImportReport,
} from '@/lib/action-state'
import { plurale } from '@/lib/labels'
import { createClient } from '@/lib/supabase/server'
import {
  customerSchema,
  passengerSchema,
  supplierSchema,
} from '@/lib/validation/anagrafiche'
import { requirePermission } from '@/server/session'
import type { Enums, TablesInsert } from '@/lib/database.types'

const MAX_IMPORT_ROWS = 2000

function formObject(formData: FormData): Record<string, FormDataEntryValue> {
  const entries: Record<string, FormDataEntryValue> = {}
  for (const [key, value] of formData.entries()) entries[key] = value
  return entries
}

/** Traduce gli errori del database in messaggi che un operatore può capire. */
function databaseMessage(error: { code?: string; message: string }, entity: string): string {
  if (error.code === '23505' || error.message.includes('duplicate key')) {
    return `Esiste già ${entity} con questi dati.`
  }
  if (error.code === '23503') {
    return `${entity} è collegato ad altri dati e non può essere rimosso.`
  }
  if (error.code === '42501' || error.message.includes('row-level security')) {
    return 'Non hai i permessi per questa operazione.'
  }
  return `Non siamo riusciti a salvare ${entity}.`
}

// =============================================================================
// Clienti
// =============================================================================

export async function saveCustomerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = customerSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const { privacy_consent, marketing_consent, profiling_consent, ...fields } = parsed.data
  const supabase = await createClient()
  const now = new Date().toISOString()

  const payload = {
    ...fields,
    agency_id: session.agency.id,
    marketing_consent,
    profiling_consent,
  }

  if (typeof id === 'string' && id !== '') {
    // Il consenso privacy si registra con la data in cui è stato raccolto:
    // una spunta senza data non dimostra nulla.
    const { data: existing } = await supabase
      .from('customers')
      .select('privacy_consent_at, marketing_consent_at, display_name')
      .eq('id', id)
      .maybeSingle()

    const { error } = await supabase
      .from('customers')
      .update({
        ...payload,
        privacy_consent_at: privacy_consent ? (existing?.privacy_consent_at ?? now) : null,
        marketing_consent_at: marketing_consent ? (existing?.marketing_consent_at ?? now) : null,
      })
      .eq('id', id)
      .eq('agency_id', session.agency.id)

    if (error) return { status: 'error', message: databaseMessage(error, 'il cliente') }

    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'modifica',
      p_entity_type: 'customers',
      p_entity_id: id,
      p_entity_label: existing?.display_name ?? null,
      p_summary: 'Aggiornamento della scheda cliente',
      p_before: null,
      p_after: null,
    })

    revalidatePath('/clienti')
    revalidatePath(`/clienti/${id}`)
    redirect(`/clienti/${id}`)
  }

  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      ...payload,
      created_by: session.user.id,
      privacy_consent_at: privacy_consent ? now : null,
      marketing_consent_at: marketing_consent ? now : null,
    })
    .select('id, display_name')
    .single()

  if (error || !created) {
    return { status: 'error', message: databaseMessage(error ?? { message: '' }, 'il cliente') }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'customers',
    p_entity_id: created.id,
    p_entity_label: created.display_name,
    p_summary: 'Creazione di un nuovo cliente',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/clienti')
  redirect(`/clienti/${created.id}`)
}

export async function deleteCustomersAction(ids: readonly string[]): Promise<ActionState> {
  const session = await requirePermission('write')
  if (ids.length === 0) return { status: 'error', message: 'Nessun cliente selezionato.' }

  const supabase = await createClient()

  // Un cliente con pratiche non si cancella: si perderebbe l'intestazione di
  // documenti fiscali già emessi.
  const { data: withBookings } = await supabase
    .from('bookings')
    .select('customer_id')
    .in('customer_id', ids)
    .is('deleted_at', null)
    .limit(1)

  if (withBookings && withBookings.length > 0) {
    return {
      status: 'error',
      message:
        'Almeno un cliente selezionato ha pratiche collegate. Per i clienti con pratiche usa l’anonimizzazione dalla scheda.',
    }
  }

  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'il cliente') }

  for (const id of ids) {
    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'eliminazione',
      p_entity_type: 'customers',
      p_entity_id: id,
      p_entity_label: null,
      p_summary: 'Eliminazione del cliente',
      p_before: null,
      p_after: null,
    })
  }

  revalidatePath('/clienti')
  return {
    status: 'success',
    message: ids.length === 1 ? 'Cliente eliminato.' : `${ids.length} clienti eliminati.`,
  }
}

export async function anonymizeCustomerAction(id: string): Promise<ActionState> {
  const session = await requirePermission('accounting')
  const supabase = await createClient()

  const { error } = await supabase.rpc('anonymize_customer', { p_customer_id: id })
  if (error) {
    return { status: 'error', message: 'Non siamo riusciti ad anonimizzare la scheda.' }
  }

  revalidatePath('/clienti')
  revalidatePath(`/clienti/${id}`)
  void session
  return {
    status: 'success',
    message: 'Scheda anonimizzata. I dati fiscali obbligatori sono stati conservati.',
  }
}

// =============================================================================
// Passeggeri
// =============================================================================

export async function savePassengerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = passengerSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const supabase = await createClient()
  const payload = {
    ...parsed.data,
    gender: parsed.data.gender as 'M' | 'F' | 'X' | null,
    document_type: parsed.data.document_type as Enums['id_document_type'] | null,
    agency_id: session.agency.id,
  }

  if (typeof id === 'string' && id !== '') {
    const { error } = await supabase
      .from('passengers')
      .update(payload)
      .eq('id', id)
      .eq('agency_id', session.agency.id)

    if (error) return { status: 'error', message: databaseMessage(error, 'il passeggero') }

    revalidatePath('/passeggeri')
    revalidatePath(`/passeggeri/${id}`)
    redirect(`/passeggeri/${id}`)
  }

  const { data: created, error } = await supabase
    .from('passengers')
    .insert({ ...payload, created_by: session.user.id })
    .select('id')
    .single()

  if (error || !created) {
    return { status: 'error', message: databaseMessage(error ?? { message: '' }, 'il passeggero') }
  }

  revalidatePath('/passeggeri')
  redirect(`/passeggeri/${created.id}`)
}

export async function deletePassengersAction(ids: readonly string[]): Promise<ActionState> {
  const session = await requirePermission('write')
  if (ids.length === 0) return { status: 'error', message: 'Nessun passeggero selezionato.' }

  const supabase = await createClient()

  const { data: linked } = await supabase
    .from('booking_passengers')
    .select('passenger_id')
    .in('passenger_id', ids)
    .is('deleted_at', null)
    .limit(1)

  if (linked && linked.length > 0) {
    return {
      status: 'error',
      message: 'Almeno un passeggero selezionato è collegato a una pratica e non può essere eliminato.',
    }
  }

  const { error } = await supabase
    .from('passengers')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'il passeggero') }

  revalidatePath('/passeggeri')
  return {
    status: 'success',
    message: ids.length === 1 ? 'Passeggero eliminato.' : `${ids.length} passeggeri eliminati.`,
  }
}

// =============================================================================
// Fornitori
// =============================================================================

export async function saveSupplierAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('write')
  const id = formData.get('id')
  const parsed = supplierSchema.safeParse(formObject(formData))

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Controlla i dati inseriti.',
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values: formValues(formData),
    }
  }

  const { default_commission_percent, ...fields } = parsed.data
  const supabase = await createClient()

  const payload = {
    ...fields,
    agency_id: session.agency.id,
    // La percentuale dell'interfaccia diventa punti base sul database.
    default_commission_bps: Math.round(default_commission_percent * 100),
  }

  if (typeof id === 'string' && id !== '') {
    const { error } = await supabase
      .from('suppliers')
      .update(payload)
      .eq('id', id)
      .eq('agency_id', session.agency.id)

    if (error) return { status: 'error', message: databaseMessage(error, 'il fornitore') }

    await supabase.rpc('log_activity', {
      p_agency_id: session.agency.id,
      p_action: 'modifica',
      p_entity_type: 'suppliers',
      p_entity_id: id,
      p_entity_label: payload.name,
      p_summary: 'Aggiornamento della scheda fornitore',
      p_before: null,
      p_after: null,
    })

    revalidatePath('/fornitori')
    revalidatePath(`/fornitori/${id}`)
    redirect(`/fornitori/${id}`)
  }

  const { data: created, error } = await supabase
    .from('suppliers')
    .insert({ ...payload, created_by: session.user.id })
    .select('id')
    .single()

  if (error || !created) {
    return { status: 'error', message: databaseMessage(error ?? { message: '' }, 'il fornitore') }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'suppliers',
    p_entity_id: created.id,
    p_entity_label: payload.name,
    p_summary: 'Creazione di un nuovo fornitore',
    p_before: null,
    p_after: null,
  })

  revalidatePath('/fornitori')
  redirect(`/fornitori/${created.id}`)
}

export async function deleteSuppliersAction(ids: readonly string[]): Promise<ActionState> {
  const session = await requirePermission('write')
  if (ids.length === 0) return { status: 'error', message: 'Nessun fornitore selezionato.' }

  const supabase = await createClient()

  const { data: used } = await supabase
    .from('booking_services')
    .select('supplier_id')
    .in('supplier_id', ids)
    .is('deleted_at', null)
    .limit(1)

  if (used && used.length > 0) {
    return {
      status: 'error',
      message:
        'Almeno un fornitore selezionato compare in una pratica. Disattivalo dalla sua scheda invece di eliminarlo.',
    }
  }

  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'il fornitore') }

  revalidatePath('/fornitori')
  return {
    status: 'success',
    message: ids.length === 1 ? 'Fornitore eliminato.' : `${ids.length} fornitori eliminati.`,
  }
}

export async function toggleSupplierActiveAction(id: string, active: boolean): Promise<ActionState> {
  const session = await requirePermission('write')
  const supabase = await createClient()

  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: active })
    .eq('id', id)
    .eq('agency_id', session.agency.id)

  if (error) return { status: 'error', message: databaseMessage(error, 'il fornitore') }

  revalidatePath('/fornitori')
  revalidatePath(`/fornitori/${id}`)
  return { status: 'success', message: active ? 'Fornitore riattivato.' : 'Fornitore disattivato.' }
}

// =============================================================================
// Importazione da CSV
// =============================================================================

type ImportEntity = 'clienti' | 'passeggeri' | 'fornitori'

/**
 * Importa righe già lette dal file nel browser.
 *
 * L'anteprima nel browser serve all'utente; la validazione qui è quella che
 * conta, perché di ciò che arriva dal client non ci si fida mai. Le righe
 * scartate vengono elencate con il numero di riga del file originale.
 */
export async function importRowsAction(
  entity: ImportEntity,
  rows: readonly { line: number; values: Record<string, unknown> }[],
): Promise<ImportReport> {
  const session = await requirePermission('write')

  if (rows.length === 0) {
    return { status: 'error', message: 'Nessuna riga da importare.', imported: 0, failed: [], skipped: [] }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      status: 'error',
      message: `Il file contiene più di ${MAX_IMPORT_ROWS} righe: dividilo in più parti.`,
      imported: 0,
      failed: [],
      skipped: [],
    }
  }

  const supabase = await createClient()
  const failed: { line: number; reason: string }[] = []
  const now = new Date().toISOString()

  const customers: Preparata<TablesInsert<'customers'>>[] = []
  const passengers: Preparata<TablesInsert<'passengers'>>[] = []
  const suppliers: Preparata<TablesInsert<'suppliers'>>[] = []

  for (const row of rows) {
    if (entity === 'clienti') {
      const parsed = customerSchema.safeParse(row.values)
      if (!parsed.success) {
        failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
        continue
      }
      const { privacy_consent, marketing_consent, profiling_consent, ...fields } = parsed.data
      customers.push({
        line: row.line,
        record: {
          ...fields,
          agency_id: session.agency.id,
          created_by: session.user.id,
          marketing_consent,
          profiling_consent,
          privacy_consent_at: privacy_consent ? now : null,
          marketing_consent_at: marketing_consent ? now : null,
        },
      })
      continue
    }

    if (entity === 'passeggeri') {
      const parsed = passengerSchema.safeParse(row.values)
      if (!parsed.success) {
        failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
        continue
      }
      passengers.push({
        line: row.line,
        record: {
          ...parsed.data,
          gender: parsed.data.gender as 'M' | 'F' | 'X' | null,
          document_type: parsed.data.document_type as Enums['id_document_type'] | null,
          agency_id: session.agency.id,
          created_by: session.user.id,
        },
      })
      continue
    }

    const parsed = supplierSchema.safeParse(row.values)
    if (!parsed.success) {
      failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
      continue
    }
    const { default_commission_percent, ...fields } = parsed.data
    suppliers.push({
      line: row.line,
      record: {
        ...fields,
        agency_id: session.agency.id,
        created_by: session.user.id,
        default_commission_bps: Math.round(default_commission_percent * 100),
      },
    })
  }

  const table = entity === 'clienti' ? 'customers' : entity === 'passeggeri' ? 'passengers' : 'suppliers'
  const preparate: readonly Preparata<object>[] =
    entity === 'clienti' ? customers : entity === 'passeggeri' ? passengers : suppliers

  // Chi reimporta lo stesso file — perché ne ha corretto tre righe, o perché
  // non ricorda di averlo già fatto — non deve ritrovarsi l'anagrafica doppia.
  const colonne: readonly ChiaveNaturale[] =
    table === 'passengers' ? ['email', 'tax_code'] : ['email', 'vat_number', 'tax_code']
  const esistenti = new Map<ChiaveNaturale, Set<string>>()
  for (const colonna of colonne) {
    const valori = [
      ...new Set(
        preparate
          .map((riga) => chiave(riga.record, colonna))
          .filter((valore): valore is string => valore !== null),
      ),
    ]
    esistenti.set(colonna, await chiaviGiaInArchivio(supabase, table, colonna, valori))
  }

  const skipped: { line: number; reason: string }[] = []
  const viste = new Map<ChiaveNaturale, Set<string>>(colonne.map((colonna) => [colonna, new Set()]))
  const daSaltare = new Set<number>()

  for (const riga of preparate) {
    const duplicata = colonne.find((colonna) => {
      const valore = chiave(riga.record, colonna)
      if (valore === null) return false
      return esistenti.get(colonna)?.has(valore) || viste.get(colonna)?.has(valore)
    })

    if (duplicata) {
      daSaltare.add(riga.line)
      skipped.push({ line: riga.line, reason: `${ETICHETTA_CHIAVE[duplicata]} già presente in anagrafica` })
      continue
    }

    for (const colonna of colonne) {
      const valore = chiave(riga.record, colonna)
      if (valore !== null) viste.get(colonna)?.add(valore)
    }
  }

  const tieni = <T,>(righe: readonly Preparata<T>[]): T[] =>
    righe.filter((riga) => !daSaltare.has(riga.line)).map((riga) => riga.record)

  const payload: object[] =
    entity === 'clienti' ? tieni(customers) : entity === 'passeggeri' ? tieni(passengers) : tieni(suppliers)

  let imported = 0
  if (payload.length > 0) {
    // Inserimento a blocchi: un file da duemila righe in un'unica richiesta
    // rischierebbe il limite di dimensione del corpo.
    const CHUNK = 200
    for (let index = 0; index < payload.length; index += CHUNK) {
      const chunk = payload.slice(index, index + CHUNK)
      const { error, count } = await supabase
        .from(table)
        // @ts-expect-error — il tipo dipende dalla tabella scelta a runtime,
        // già garantito dallo schema Zod applicato sopra.
        .insert(chunk, { count: 'exact' })

      if (error) {
        return {
          status: 'error',
          message: `Importazione interrotta alla riga ${index + 1} del blocco: ${databaseMessage(error, 'la riga')}`,
          imported,
          failed,
          skipped,
        }
      }
      imported += count ?? chunk.length
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: table,
    p_entity_id: null,
    p_entity_label: null,
    p_summary: `Importazione da CSV: ${imported} righe inserite, ${failed.length} scartate, ${skipped.length} già presenti`,
    p_before: null,
    p_after: null,
  })

  revalidatePath(`/${entity}`)

  const parti = [`${plurale(imported, 'riga', 'righe')} importate`]
  if (skipped.length > 0) parti.push(`${plurale(skipped.length, 'riga', 'righe')} già in archivio`)
  if (failed.length > 0) parti.push(`${plurale(failed.length, 'riga', 'righe')} scartate`)

  return {
    status: failed.length > 0 && imported === 0 ? 'error' : 'success',
    message: `${parti.join(', ')}.`,
    imported,
    failed,
    skipped,
  }
}

/** Riga pronta per l'inserimento, con il numero di riga del file da cui viene. */
interface Preparata<T> {
  readonly line: number
  readonly record: T
}

/**
 * Le colonne su cui si riconosce un doppione. Non c'è un vincolo di unicità sul
 * database — due fratelli possono condividere un telefono, e un cliente può non
 * avere né email né codici — quindi il controllo è qui, sui valori che quando
 * ci sono identificano davvero una persona o un'azienda.
 */
type ChiaveNaturale = 'email' | 'vat_number' | 'tax_code'

const ETICHETTA_CHIAVE: Record<ChiaveNaturale, string> = {
  email: 'Email',
  vat_number: 'Partita IVA',
  tax_code: 'Codice fiscale',
}

function chiave(record: object, colonna: ChiaveNaturale): string | null {
  const valore = (record as Record<string, unknown>)[colonna]
  if (typeof valore !== 'string') return null
  const pulito = valore.trim().toLowerCase()
  return pulito === '' ? null : pulito
}

async function chiaviGiaInArchivio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'customers' | 'passengers' | 'suppliers',
  colonna: ChiaveNaturale,
  valori: readonly string[],
): Promise<Set<string>> {
  const trovate = new Set<string>()
  if (valori.length === 0) return trovate

  const CHUNK = 200
  for (let index = 0; index < valori.length; index += CHUNK) {
    const { data } = await supabase
      .from(table)
      .select(colonna)
      .is('deleted_at', null)
      .in(colonna, valori.slice(index, index + CHUNK))

    for (const riga of data ?? []) {
      const valore = (riga as Record<string, unknown>)[colonna]
      if (typeof valore === 'string') trovate.add(valore.trim().toLowerCase())
    }
  }
  return trovate
}
