'use server'

import { revalidatePath } from 'next/cache'
import { plurale } from '@/lib/labels'
import { createClient } from '@/lib/supabase/server'
import type { ImportReport } from '@/lib/action-state'
import type { Enums, Json, TablesInsert } from '@/lib/database.types'
import type { ImportEntity } from '@/lib/import-registry'
import {
  customerSchema,
  passengerSchema,
  supplierSchema,
} from '@/lib/validation/anagrafiche'
import { raggruppaDocumenti } from '@/lib/import-fatture'
import { legacyInvoiceImportSchema } from '@/lib/validation/fatture'
import { bookingImportSchema, quoteImportSchema } from '@/lib/validation/pratiche'
import { requirePermission } from '@/server/session'

/**
 * Quante righe accetta un file, per entità.
 *
 * Le anagrafiche e le pratiche entrano a blocchi di cento o duecento righe per
 * richiesta, e duemila righe stanno dentro il tempo massimo di una funzione
 * serverless. I documenti pregressi no: ognuno è una chiamata a sé —
 * `import_legacy_invoice` apre la bozza, scrive le righe, numera e porta avanti
 * il contatore in una transazione — e trecento chiamate sono già il limite del
 * ragionevole. Chi ha tre anni di fatturato le importa un anno per volta, e lo
 * dice il messaggio.
 */
const MAX_IMPORT_ROWS = 2000
const MAX_IMPORT_ROWS_FATTURE = 300

function tettoRighe(entity: ImportEntity): number {
  return entity === 'fatture' ? MAX_IMPORT_ROWS_FATTURE : MAX_IMPORT_ROWS
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
// Importazione da CSV
// =============================================================================

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
  // Il tetto vale per ogni entità: oltre quella soglia la richiesta supera il
  // tempo massimo della funzione serverless e l'utente vede un errore generico
  // a metà importazione.
  const tetto = tettoRighe(entity)
  if (rows.length > tetto) {
    return {
      status: 'error',
      message: `Il file contiene più di ${tetto} righe: dividilo in più parti.`,
      imported: 0,
      failed: [],
      skipped: [],
    }
  }
  if (entity === 'pratiche') {
    return importaPratiche(session, rows)
  }
  if (entity === 'preventivi') {
    return importaPreventivi(session, rows)
  }
  if (entity === 'fatture') {
    return importaFatture(session, rows)
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

// =============================================================================
// Importazione delle pratiche
// =============================================================================

/** Chiave di ricerca normalizzata: senza accenti, senza punteggiatura, minuscola. */
function normalizza(valore: string): string {
  return valore
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

type RigaCliente = {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  vat_number: string | null
  tax_code: string | null
}

/**
 * L'indice dei clienti dell'agenzia, per risolvere il riferimento del file.
 *
 * Una chiave che compare su due clienti diversi viene marcata ambigua e non
 * risolve niente: importare la pratica sul cliente sbagliato è peggio che non
 * importarla, perché nessuno se ne accorge.
 */
function indiceClienti(clienti: readonly RigaCliente[]): ReadonlyMap<string, string | null> {
  const indice = new Map<string, string | null>()

  const aggiungi = (chiave: string | null | undefined, id: string) => {
    if (!chiave) return
    const k = normalizza(chiave)
    if (k === '') return
    if (indice.has(k) && indice.get(k) !== id) {
      indice.set(k, null) // ambigua
      return
    }
    indice.set(k, id)
  }

  for (const cliente of clienti) {
    aggiungi(cliente.email, cliente.id)
    aggiungi(cliente.vat_number, cliente.id)
    aggiungi(cliente.tax_code, cliente.id)
    aggiungi(cliente.company_name, cliente.id)
    const cognome = cliente.last_name ?? ''
    const nome = cliente.first_name ?? ''
    if (cognome !== '' || nome !== '') {
      aggiungi(`${cognome} ${nome}`, cliente.id)
      aggiungi(`${nome} ${cognome}`, cliente.id)
    }
  }

  return indice
}

/**
 * Il cliente del file, risolto su un identificativo dell'archivio.
 *
 * Il messaggio di errore dice cosa fare e non solo cosa non è andato: chi
 * importa duemila righe ha bisogno di sapere se deve importare prima i clienti
 * o distinguerne due omonimi.
 */
function risolviCliente(
  indice: ReadonlyMap<string, string | null>,
  testo: string,
): { id: string; errore: null } | { id: null; errore: string } {
  const chiave = normalizza(testo)
  if (!indice.has(chiave)) {
    return {
      id: null,
      errore: `Nessun cliente corrisponde a «${testo}»: importa prima i clienti`,
    }
  }
  const id = indice.get(chiave)
  if (id === null || id === undefined) {
    return {
      id: null,
      errore: `Più di un cliente corrisponde a «${testo}»: distinguili con l’email o la partita IVA`,
    }
  }
  return { id, errore: null }
}

const SERVIZIO_DA_VENDITA: Record<string, Enums['vat_regime']> = {
  organizzazione: 'art_74_ter',
  intermediazione: 'ordinaria',
}

/**
 * Le pratiche in arrivo da un altro gestionale.
 *
 * Sta a parte dalle anagrafiche perché fa due cose che quelle non fanno:
 * risolve il cliente partendo da un testo, e scrive su due tabelle — la
 * pratica e la riga di servizio che le dà un importo. Una pratica senza
 * importo è un viaggio a margine zero: occupa spazio e non dice niente.
 */
async function importaPratiche(
  session: Awaited<ReturnType<typeof requirePermission>>,
  rows: readonly { line: number; values: Record<string, unknown> }[],
): Promise<ImportReport> {
  const supabase = await createClient()
  const failed: { line: number; reason: string }[] = []
  const skipped: { line: number; reason: string }[] = []

  const { data: clienti } = await supabase
    .from('customers')
    .select('id, first_name, last_name, company_name, email, vat_number, tax_code')
    .is('deleted_at', null)

  const indice = indiceClienti(clienti ?? [])

  interface Preparata {
    readonly line: number
    readonly booking: TablesInsert<'bookings'>
    readonly servizio: { descrizione: string; prezzo: number; costo: number } | null
    readonly impronta: string
  }

  const preparate: Preparata[] = []
  const impronteViste = new Set<string>()

  for (const row of rows) {
    const parsed = bookingImportSchema.safeParse(row.values)
    if (!parsed.success) {
      failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
      continue
    }
    const dati = parsed.data

    const risolto = risolviCliente(indice, dati.cliente)
    if (risolto.errore !== null) {
      failed.push({ line: row.line, reason: risolto.errore })
      continue
    }
    const customerId = risolto.id

    const impronta = `${customerId}|${normalizza(dati.title)}|${dati.departure_date ?? ''}`
    if (impronteViste.has(impronta)) {
      skipped.push({ line: row.line, reason: 'Riga doppia nello stesso file' })
      continue
    }
    impronteViste.add(impronta)

    // `amountCents` consegna già i centesimi: la conversione da «1.234,50» è
    // avvenuta nello schema, dove avviene per ogni importo del gestionale.
    const prezzo = dati.importo ?? 0
    const costo = dati.costo ?? 0

    preparate.push({
      line: row.line,
      booking: {
        agency_id: session.agency.id,
        created_by: session.user.id,
        customer_id: customerId,
        title: dati.title,
        destination: dati.destination,
        country: dati.country,
        departure_date: dati.departure_date,
        return_date: dati.return_date,
        pax_count: dati.pax_count,
        sale_type: dati.sale_type as Enums['sale_type'],
        status: dati.status as Enums['booking_status'],
        notes: dati.notes,
      },
      servizio:
        prezzo === 0 && costo === 0
          ? null
          : {
              descrizione: dati.servizio?.trim() || dati.title,
              prezzo,
              costo,
            },
      impronta,
    })
  }

  // Chi reimporta lo stesso file non deve ritrovarsi le pratiche doppie. La
  // chiave naturale di una pratica è il cliente più il titolo più la data di
  // partenza: due viaggi identici per la stessa persona nello stesso giorno
  // sono, nella pratica, lo stesso viaggio.
  if (preparate.length > 0) {
    const { data: esistenti } = await supabase
      .from('bookings')
      .select('customer_id, title, departure_date')
      .is('deleted_at', null)
      .in('customer_id', [...new Set(preparate.map((p) => p.booking.customer_id))])

    const gia = new Set(
      (esistenti ?? []).map(
        (b) => `${b.customer_id}|${normalizza(b.title ?? '')}|${b.departure_date ?? ''}`,
      ),
    )
    for (const riga of preparate) {
      if (gia.has(riga.impronta)) {
        skipped.push({ line: riga.line, reason: 'Pratica già presente per questo cliente' })
      }
    }
    const daSaltare = new Set(skipped.map((s) => s.line))
    preparate.splice(0, preparate.length, ...preparate.filter((p) => !daSaltare.has(p.line)))
  }

  let imported = 0
  const CHUNK = 100

  for (let i = 0; i < preparate.length; i += CHUNK) {
    const blocco = preparate.slice(i, i + CHUNK)
    const { data: inserite, error } = await supabase
      .from('bookings')
      .insert(blocco.map((b) => b.booking))
      .select('id, customer_id, title, departure_date')

    if (error || !inserite) {
      return {
        status: 'error',
        message: `Importazione interrotta: ${databaseMessage(error ?? { message: '' }, 'la pratica')}`,
        imported,
        failed,
        skipped,
      }
    }
    imported += inserite.length

    // Le righe di servizio si riagganciano alla pratica per impronta e non per
    // posizione: l'ordine con cui PostgREST restituisce le righe inserite non è
    // garantito da nulla, e un importo attaccato alla pratica sbagliata è un
    // errore che nessuno vede.
    const perImpronta = new Map(blocco.map((riga) => [riga.impronta, riga]))
    const servizi: TablesInsert<'booking_services'>[] = []
    for (const pratica of inserite) {
      const impronta = `${pratica.customer_id}|${normalizza(pratica.title ?? '')}|${pratica.departure_date ?? ''}`
      const riga = perImpronta.get(impronta)
      if (!riga?.servizio) continue
      servizi.push({
        agency_id: session.agency.id,
        booking_id: pratica.id,
        created_by: session.user.id,
        description: riga.servizio.descrizione,
        quantity: 1,
        unit_price_cents: riga.servizio.prezzo,
        unit_cost_cents: riga.servizio.costo,
        vat_bps: session.settings.default_vat_bps,
        vat_regime: SERVIZIO_DA_VENDITA[riga.booking.sale_type ?? 'intermediazione'] ?? 'ordinaria',
        sort_order: 0,
      })
    }

    if (servizi.length > 0) {
      const { error: erroreServizi } = await supabase.from('booking_services').insert(servizi)
      if (erroreServizi) {
        return {
          status: 'error',
          message: `Pratiche importate, ma gli importi no: ${databaseMessage(erroreServizi, 'la riga')}`,
          imported,
          failed,
          skipped,
        }
      }
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'bookings',
    p_entity_id: null,
    p_entity_label: null,
    p_summary: `Importazione pratiche da CSV: ${imported} inserite, ${failed.length} scartate, ${skipped.length} già presenti`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/pratiche')
  revalidatePath('/')

  const parti = [`${plurale(imported, 'pratica', 'pratiche')} importate`]
  if (skipped.length > 0) parti.push(`${plurale(skipped.length, 'riga', 'righe')} già in archivio`)
  if (failed.length > 0) parti.push(`${plurale(failed.length, 'riga', 'righe')} scartate`)

  return {
    status: imported > 0 ? 'success' : 'error',
    message: parti.join(', ') + '.',
    imported,
    failed,
    skipped,
  }
}

// =============================================================================
// Importazione dei preventivi
// =============================================================================

/**
 * I preventivi in arrivo da un altro gestionale.
 *
 * Due differenze rispetto alle pratiche. La numerazione: un preventivo
 * importato prende il numero di questo gestionale, e quello vecchio resta nelle
 * note — non è un documento fiscale, nessuno deve ritrovarlo per numero. Le
 * varianti: il file ne porta una sola, che diventa la variante «base». Chi vuole
 * affiancarne altre due lo fa dalla pagina del preventivo, dove il confronto
 * esiste già.
 */
async function importaPreventivi(
  session: Awaited<ReturnType<typeof requirePermission>>,
  rows: readonly { line: number; values: Record<string, unknown> }[],
): Promise<ImportReport> {
  const supabase = await createClient()
  const failed: { line: number; reason: string }[] = []
  const skipped: { line: number; reason: string }[] = []

  const { data: clienti } = await supabase
    .from('customers')
    .select('id, first_name, last_name, company_name, email, vat_number, tax_code')
    .is('deleted_at', null)

  const indice = indiceClienti(clienti ?? [])

  interface Preparato {
    readonly line: number
    readonly quote: TablesInsert<'quotes'>
    readonly riga: { descrizione: string; prezzo: number; costo: number } | null
    readonly impronta: string
  }

  const preparati: Preparato[] = []
  const improntePresenti = new Set<string>()

  for (const row of rows) {
    const parsed = quoteImportSchema.safeParse(row.values)
    if (!parsed.success) {
      failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
      continue
    }
    const dati = parsed.data

    const risolto = risolviCliente(indice, dati.cliente)
    if (risolto.errore !== null) {
      failed.push({ line: row.line, reason: risolto.errore })
      continue
    }

    const impronta = `${risolto.id}|${normalizza(dati.title)}|${dati.departure_date ?? ''}`
    if (improntePresenti.has(impronta)) {
      skipped.push({ line: row.line, reason: 'Riga doppia nello stesso file' })
      continue
    }
    improntePresenti.add(impronta)

    // Il numero di origine va in coda alle note e non in un campo suo: è un
    // dato che serve a cercare, e la ricerca dei preventivi guarda già le note.
    const note = [dati.notes, dati.riferimento ? `Numero di origine: ${dati.riferimento}` : null]
      .filter((parte): parte is string => parte !== null && parte !== '')
      .join('\n')

    const prezzo = dati.importo ?? 0
    const costo = dati.costo ?? 0

    preparati.push({
      line: row.line,
      quote: {
        agency_id: session.agency.id,
        created_by: session.user.id,
        customer_id: risolto.id,
        title: dati.title,
        destination: dati.destination,
        departure_date: dati.departure_date,
        return_date: dati.return_date,
        pax_count: dati.pax_count,
        sale_type: dati.sale_type as Enums['sale_type'],
        status: dati.status as Enums['quote_status'],
        valid_until: dati.valid_until,
        notes: note === '' ? null : note,
        // Un preventivo accettato altrove resta accettato qui, sulla variante
        // che il file porta. La data dell'accettazione no: non la sappiamo, e
        // inventarla falserebbe i rapporti che contano le accettazioni per mese.
        accepted_variant: dati.status === 'accettato' ? 'base' : null,
      },
      riga:
        prezzo === 0 && costo === 0
          ? null
          : { descrizione: dati.servizio?.trim() || dati.title, prezzo, costo },
      impronta,
    })
  }

  if (preparati.length > 0) {
    const { data: esistenti } = await supabase
      .from('quotes')
      .select('customer_id, title, departure_date')
      .is('deleted_at', null)
      .in('customer_id', [...new Set(preparati.map((p) => p.quote.customer_id!))])

    const gia = new Set(
      (esistenti ?? []).map(
        (q) => `${q.customer_id}|${normalizza(q.title ?? '')}|${q.departure_date ?? ''}`,
      ),
    )
    for (const riga of preparati) {
      if (gia.has(riga.impronta)) {
        skipped.push({ line: riga.line, reason: 'Preventivo già presente per questo cliente' })
      }
    }
    const daSaltare = new Set(skipped.map((s) => s.line))
    preparati.splice(0, preparati.length, ...preparati.filter((p) => !daSaltare.has(p.line)))
  }

  let imported = 0
  const CHUNK = 100

  for (let i = 0; i < preparati.length; i += CHUNK) {
    const blocco = preparati.slice(i, i + CHUNK)
    const { data: inseriti, error } = await supabase
      .from('quotes')
      .insert(blocco.map((p) => p.quote))
      .select('id, customer_id, title, departure_date')

    if (error || !inseriti) {
      return {
        status: 'error',
        message: `Importazione interrotta: ${databaseMessage(error ?? { message: '' }, 'il preventivo')}`,
        imported,
        failed,
        skipped,
      }
    }
    imported += inseriti.length

    const perImpronta = new Map(blocco.map((riga) => [riga.impronta, riga]))
    const voci: TablesInsert<'quote_items'>[] = []
    for (const preventivo of inseriti) {
      const impronta = `${preventivo.customer_id}|${normalizza(preventivo.title ?? '')}|${preventivo.departure_date ?? ''}`
      const riga = perImpronta.get(impronta)
      if (!riga?.riga) continue
      voci.push({
        agency_id: session.agency.id,
        quote_id: preventivo.id,
        created_by: session.user.id,
        variant: 'base',
        service_type: 'pacchetto',
        description: riga.riga.descrizione,
        quantity: 1,
        unit_price_cents: riga.riga.prezzo,
        unit_cost_cents: riga.riga.costo,
        vat_bps: session.settings.default_vat_bps,
        vat_regime: SERVIZIO_DA_VENDITA[riga.quote.sale_type ?? 'intermediazione'] ?? 'ordinaria',
        sort_order: 0,
      })
    }

    if (voci.length > 0) {
      const { error: erroreVoci } = await supabase.from('quote_items').insert(voci)
      if (erroreVoci) {
        return {
          status: 'error',
          message: `Preventivi importati, ma gli importi no: ${databaseMessage(erroreVoci, 'la riga')}`,
          imported,
          failed,
          skipped,
        }
      }
    }
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'quotes',
    p_entity_id: null,
    p_entity_label: null,
    p_summary: `Importazione preventivi da CSV: ${imported} inseriti, ${failed.length} scartati, ${skipped.length} già presenti`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/preventivi')
  revalidatePath('/')

  const parti = [`${plurale(imported, 'preventivo', 'preventivi')} importati`]
  if (skipped.length > 0) parti.push(`${plurale(skipped.length, 'riga', 'righe')} già in archivio`)
  if (failed.length > 0) parti.push(`${plurale(failed.length, 'riga', 'righe')} scartate`)

  return {
    status: imported > 0 ? 'success' : 'error',
    message: parti.join(', ') + '.',
    imported,
    failed,
    skipped,
  }
}

// =============================================================================
// Importazione dei documenti pregressi
// =============================================================================

/**
 * Le fatture già emesse dal gestionale di prima.
 *
 * È l'importazione più delicata delle cinque, perché scrive documenti fiscali.
 * Tre regole la governano, e stanno sul database — `import_legacy_invoice` nella
 * migrazione 0023 — non qui: il numero di origine si conserva, il contatore
 * della numerazione va avanti fino al numero più alto importato, e un documento
 * importato non si trasmette mai allo SdI perché era già stato trasmesso.
 *
 * Qui si fa quello che al database non si può chiedere: risolvere il cliente
 * partendo da un testo, ricomporre le righe del file in documenti, e riportare
 * all'utente quali righe non sono passate e perché. Ogni documento è una
 * chiamata a sé: una fattura che non passa non deve far cadere le altre
 * duecento, perché chi importa vuole sapere quali mancano, non ricominciare.
 */
async function importaFatture(
  session: Awaited<ReturnType<typeof requirePermission>>,
  rows: readonly { line: number; values: Record<string, unknown> }[],
): Promise<ImportReport> {
  // Scrivere documenti fiscali non è «scrivere»: serve il permesso contabile.
  if (!session.permissions.accounting) {
    return {
      status: 'error',
      message: 'Per importare i documenti serve il permesso di amministrazione.',
      imported: 0,
      failed: [],
      skipped: [],
    }
  }

  const supabase = await createClient()
  const failed: { line: number; reason: string }[] = []
  const skipped: { line: number; reason: string }[] = []

  const { data: clienti } = await supabase
    .from('customers')
    .select('id, first_name, last_name, company_name, email, vat_number, tax_code')
    .is('deleted_at', null)

  const indice = indiceClienti(clienti ?? [])

  const valide: { line: number; dati: ReturnType<typeof legacyInvoiceImportSchema.parse> }[] = []
  for (const row of rows) {
    const parsed = legacyInvoiceImportSchema.safeParse(row.values)
    if (!parsed.success) {
      failed.push({ line: row.line, reason: parsed.error.issues[0]?.message ?? 'Dati non validi' })
      continue
    }
    valide.push({ line: row.line, dati: parsed.data })
  }

  const { documenti, conflitti } = raggruppaDocumenti(valide)
  failed.push(...conflitti)

  // I documenti già in archivio: numero, anno e tipo sono la loro identità.
  const { data: esistenti } = await supabase
    .from('invoices')
    .select('kind, year, number')
    .is('deleted_at', null)

  const gia = new Set((esistenti ?? []).map((i) => `${i.kind}|${i.year}|${i.number}`))

  let imported = 0

  for (const documento of documenti) {
    const risolto = risolviCliente(indice, documento.cliente)
    if (risolto.errore !== null) {
      for (const line of documento.lines) failed.push({ line, reason: risolto.errore })
      continue
    }

    const identita = `${documento.kind}|${documento.year}|${documento.number}`
    if (gia.has(identita)) {
      for (const line of documento.lines) {
        skipped.push({ line, reason: `Il documento ${documento.number} del ${documento.year} è già in archivio` })
      }
      continue
    }

    const { error } = await supabase.rpc('import_legacy_invoice', {
      p_customer_id: risolto.id,
      p_kind: documento.kind,
      p_year: documento.year,
      p_number: documento.number,
      p_code: documento.code,
      p_issue_date: documento.issue_date,
      p_due_date: documento.due_date,
      p_status: documento.status,
      p_vat_regime: documento.vat_regime as Enums['vat_regime'],
      p_notes: documento.notes,
      p_items: documento.items as unknown as Json,
    })

    if (error) {
      // Il messaggio del database è scritto per l'operatore: «Il documento 417
      // del 2025 esiste già», «La data di emissione non può essere nel futuro».
      // Riportarlo com'è dice più di qualunque traduzione generica.
      const motivo = error.message.replace(/^.*?:\s*/, '') || databaseMessage(error, 'il documento')
      for (const line of documento.lines) failed.push({ line, reason: motivo })
      continue
    }

    gia.add(identita)
    imported += 1
  }

  await supabase.rpc('log_activity', {
    p_agency_id: session.agency.id,
    p_action: 'creazione',
    p_entity_type: 'invoices',
    p_entity_id: null,
    p_entity_label: null,
    p_summary: `Importazione documenti pregressi da CSV: ${imported} inseriti, ${failed.length} righe scartate, ${skipped.length} già presenti`,
    p_before: null,
    p_after: null,
  })

  revalidatePath('/fatture')
  revalidatePath('/registri')
  revalidatePath('/scadenzario')
  revalidatePath('/')

  const parti = [`${plurale(imported, 'documento', 'documenti')} importati`]
  if (skipped.length > 0) parti.push(`${plurale(skipped.length, 'riga', 'righe')} già in archivio`)
  if (failed.length > 0) parti.push(`${plurale(failed.length, 'riga', 'righe')} scartate`)

  return {
    status: imported > 0 ? 'success' : 'error',
    message: parti.join(', ') + '.',
    imported,
    failed,
    skipped,
  }
}
