import { z } from 'zod'
import { amountCents, intero, optionalDate, optionalText, percentBps } from '@/lib/validation/comune'

// --- Pratica ------------------------------------------------------------------
export const bookingSchema = z
  .object({
    customer_id: z.string().uuid('Scegli il cliente intestatario'),
    owner_id: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' || value === 'nessuno' ? null : value))
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
        message: 'Operatore non valido',
      }),
    title: z.string().trim().min(2, 'Il titolo è obbligatorio').max(200),
    destination: z.string().trim().min(2, 'La destinazione è obbligatoria').max(160),
    country: optionalText(80),
    departure_date: optionalDate,
    return_date: optionalDate,
    pax_count: intero('Numero di passeggeri', 0, 500, 1),
    sale_type: z.enum(['intermediazione', 'organizzazione'], {
      error: 'Tipo di vendita non valido',
    }),
    notes: optionalText(4000),
    internal_notes: optionalText(4000),
  })
  .refine(
    (data) =>
      data.departure_date === null ||
      data.return_date === null ||
      data.return_date >= data.departure_date,
    { message: 'Il rientro non può precedere la partenza', path: ['return_date'] },
  )

export type BookingInput = z.infer<typeof bookingSchema>

// --- Riga di servizio ---------------------------------------------------------
export const bookingServiceSchema = z
  .object({
    booking_id: z.string().uuid(),
    service_type: z.enum(
      [
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
      ],
      { error: 'Tipo di servizio non valido' },
    ),
    supplier_id: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' || value === 'nessuno' ? null : value))
      .refine((value) => value === null || z.string().uuid().safeParse(value).success, {
        message: 'Fornitore non valido',
      }),
    description: z.string().trim().min(2, 'La descrizione è obbligatoria').max(300),
    details: optionalText(2000),
    confirmation_code: optionalText(80),
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
    supplier_due_date: optionalDate,
    sort_order: intero('Ordine', 0, 9999, 0),
  })
  .refine(
    (data) => data.date_from === null || data.date_to === null || data.date_to >= data.date_from,
    { message: 'La data finale non può precedere quella iniziale', path: ['date_to'] },
  )

export type BookingServiceInput = z.infer<typeof bookingServiceSchema>

// --- Passeggero della pratica -------------------------------------------------
export const bookingPassengerSchema = z.object({
  booking_id: z.string().uuid(),
  passenger_id: z.string().uuid('Scegli il passeggero'),
  role: z.enum(['titolare', 'accompagnatore', 'minore'], { error: 'Ruolo non valido' }),
  room_label: optionalText(40),
  seat_label: optionalText(40),
  notes: optionalText(500),
})

export type BookingPassengerInput = z.infer<typeof bookingPassengerSchema>

// --- Annullamento -------------------------------------------------------------
export const cancelBookingSchema = z.object({
  booking_id: z.string().uuid(),
  reason: z.string().trim().min(3, 'Indica il motivo dell’annullamento').max(500),
  penalty: amountCents('Penale'),
})

// --- Vista salvata ------------------------------------------------------------
export const savedViewSchema = z.object({
  entity: z.enum(['pratiche', 'preventivi', 'clienti', 'passeggeri', 'fornitori'], {
    error: 'Elenco non valido',
  }),
  name: z.string().trim().min(2, 'Dai un nome alla vista').max(60),
  query: z.string().trim().max(2000).optional().transform((value) => value ?? ''),
  shared: z
    .unknown()
    .optional()
    .transform((value) => value === 'on' || value === 'true' || value === true),
})

export type SavedViewInput = z.infer<typeof savedViewSchema>

/**
 * Lo schema di una pratica che arriva da un file CSV.
 *
 * Differisce da `bookingSchema` in un punto solo, ma decisivo: il cliente
 * arriva come testo — un nome, un'email, una partita IVA — e non come
 * identificativo. Nessun gestionale esporta gli UUID di questo, e chiedere a
 * chi migra di procurarseli equivale a dirgli di non migrare.
 *
 * Porta anche l'importo e il costo della pratica. Senza, si importerebbero
 * sessanta viaggi a margine zero: dati che occupano spazio e non dicono
 * niente, ed e' la prima cosa che chi valuta il trasloco va a guardare.
 */
export const bookingImportSchema = z
  .object({
    cliente: z
      .string()
      .trim()
      .min(1, 'Indica il cliente: nome, email, partita IVA o codice fiscale'),
    title: z.string().trim().min(2, 'Il titolo è obbligatorio').max(200),
    destination: z.string().trim().min(2, 'La destinazione è obbligatoria').max(160),
    country: optionalText(80),
    departure_date: optionalDate,
    return_date: optionalDate,
    pax_count: intero('Numero di passeggeri', 0, 500, 1),
    sale_type: z.enum(['intermediazione', 'organizzazione'], {
      error: 'Tipo di vendita non valido: ammessi "intermediazione" e "organizzazione"',
    }),
    status: z.enum(['bozza', 'opzione', 'confermata', 'annullata', 'conclusa'], {
      error: 'Stato non valido',
    }),
    notes: optionalText(4000),
    servizio: optionalText(300),
    importo: amountCents('Importo'),
    costo: amountCents('Costo'),
  })
  .refine(
    (data) =>
      data.departure_date === null ||
      data.return_date === null ||
      data.return_date >= data.departure_date,
    { message: 'Il rientro non può precedere la partenza', path: ['return_date'] },
  )

export type BookingImportInput = z.infer<typeof bookingImportSchema>

// --- Preventivo importato -----------------------------------------------------
/**
 * Un preventivo in arrivo da un altro gestionale.
 *
 * Il numero del preventivo non si conserva: non è un documento fiscale, e la
 * numerazione di questo gestionale riparte da uno ogni anno. Se il numero
 * vecchio serve a ritrovarlo, finisce nelle note — dove si cerca.
 */
export const quoteImportSchema = z
  .object({
    cliente: z
      .string()
      .trim()
      .min(1, 'Indica il cliente: nome, email, partita IVA o codice fiscale'),
    title: z.string().trim().min(2, 'Il titolo è obbligatorio').max(200),
    destination: z.string().trim().min(2, 'La destinazione è obbligatoria').max(160),
    departure_date: optionalDate,
    return_date: optionalDate,
    pax_count: intero('Numero di passeggeri', 0, 500, 1),
    sale_type: z.enum(['intermediazione', 'organizzazione'], {
      error: 'Tipo di vendita non valido: ammessi "intermediazione" e "organizzazione"',
    }),
    status: z.enum(['bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto'], {
      error: 'Stato non valido',
    }),
    valid_until: optionalDate,
    notes: optionalText(4000),
    riferimento: optionalText(80),
    servizio: optionalText(300),
    importo: amountCents('Importo'),
    costo: amountCents('Costo'),
  })
  .refine(
    (data) =>
      data.departure_date === null ||
      data.return_date === null ||
      data.return_date >= data.departure_date,
    { message: 'Il rientro non può precedere la partenza', path: ['return_date'] },
  )

export type QuoteImportInput = z.infer<typeof quoteImportSchema>
