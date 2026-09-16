import { describe, expect, it } from 'vitest'
import {
  bookingSchema,
  bookingServiceSchema,
  cancelBookingSchema,
  savedViewSchema,
} from '@/lib/validation/pratiche'

const UUID = '11111111-1111-4111-8111-111111111111'

const praticaBase = {
  customer_id: UUID,
  title: 'Viaggio di nozze',
  destination: 'Maldive',
  sale_type: 'organizzazione',
}

const rigaBase = {
  booking_id: UUID,
  service_type: 'hotel',
  description: 'Soggiorno 7 notti',
  vat_regime: 'art_74_ter',
}

describe('schema della pratica', () => {
  it('accetta il minimo indispensabile', () => {
    const esito = bookingSchema.safeParse(praticaBase)
    expect(esito.success).toBe(true)
    expect(esito.data?.pax_count).toBe(1)
  })

  it('pretende cliente, titolo e destinazione', () => {
    const esito = bookingSchema.safeParse({ sale_type: 'intermediazione' })
    expect(esito.success).toBe(false)
  })

  it('rifiuta un rientro precedente alla partenza', () => {
    const esito = bookingSchema.safeParse({
      ...praticaBase,
      departure_date: '2027-03-10',
      return_date: '2027-03-01',
    })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.message).toBe('Il rientro non può precedere la partenza')
  })

  it('accetta partenza e rientro nello stesso giorno', () => {
    const esito = bookingSchema.safeParse({
      ...praticaBase,
      departure_date: '2027-03-10',
      return_date: '2027-03-10',
    })
    expect(esito.success).toBe(true)
  })

  it('tratta "nessuno" come pratica non assegnata', () => {
    const esito = bookingSchema.safeParse({ ...praticaBase, owner_id: 'nessuno' })
    expect(esito.data?.owner_id).toBeNull()
  })

  it('non lascia passare un tipo di vendita inventato', () => {
    const esito = bookingSchema.safeParse({ ...praticaBase, sale_type: 'permuta' })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.message).toBe('Tipo di vendita non valido')
  })
})

describe('schema della riga di servizio', () => {
  it('converte gli importi digitati in centesimi interi', () => {
    const esito = bookingServiceSchema.safeParse({
      ...rigaBase,
      unit_cost: '1.234,56',
      unit_price: '1500',
    })
    expect(esito.success).toBe(true)
    expect(esito.data?.unit_cost).toBe(123_456)
    expect(esito.data?.unit_price).toBe(150_000)
  })

  it('accetta il punto come separatore decimale', () => {
    const esito = bookingServiceSchema.safeParse({ ...rigaBase, unit_price: '99.90' })
    expect(esito.data?.unit_price).toBe(9_990)
  })

  it('rifiuta un importo che non è un importo', () => {
    const esito = bookingServiceSchema.safeParse({ ...rigaBase, unit_price: 'mille euro' })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.message).toContain('importo non valido')
  })

  it('converte la commissione da percentuale a punti base', () => {
    const esito = bookingServiceSchema.safeParse({ ...rigaBase, commission_percent: '12,5' })
    expect(esito.data?.commission_percent).toBe(1250)
  })

  it('rifiuta una commissione oltre il cento per cento', () => {
    const esito = bookingServiceSchema.safeParse({ ...rigaBase, commission_percent: '140' })
    expect(esito.success).toBe(false)
  })

  it('rifiuta una data finale precedente a quella iniziale', () => {
    const esito = bookingServiceSchema.safeParse({
      ...rigaBase,
      date_from: '2027-05-10',
      date_to: '2027-05-01',
    })
    expect(esito.success).toBe(false)
  })

  it('senza quantità vale una unità', () => {
    expect(bookingServiceSchema.safeParse(rigaBase).data?.quantity).toBe(1)
  })

  it('rifiuta una quantità nulla', () => {
    const esito = bookingServiceSchema.safeParse({ ...rigaBase, quantity: '0' })
    expect(esito.success).toBe(false)
  })
})

describe('annullamento della pratica', () => {
  it('pretende un motivo', () => {
    const esito = cancelBookingSchema.safeParse({ booking_id: UUID, reason: '' })
    expect(esito.success).toBe(false)
  })

  it('converte la penale in centesimi', () => {
    const esito = cancelBookingSchema.safeParse({
      booking_id: UUID,
      reason: 'Rinuncia del cliente',
      penalty: '150,00',
    })
    expect(esito.data?.penalty).toBe(15_000)
  })

  it('senza penale il campo resta nullo, non zero implicito', () => {
    const esito = cancelBookingSchema.safeParse({ booking_id: UUID, reason: 'Rinuncia' })
    expect(esito.data?.penalty).toBeNull()
  })
})

describe('vista salvata', () => {
  it('pretende un nome leggibile', () => {
    expect(savedViewSchema.safeParse({ entity: 'pratiche', name: 'x' }).success).toBe(false)
  })

  it('la casella di condivisione non spuntata vale no', () => {
    const esito = savedViewSchema.safeParse({ entity: 'pratiche', name: 'Partenze del mese' })
    expect(esito.data?.shared).toBe(false)
    expect(esito.data?.query).toBe('')
  })

  it('conserva la query string così com’è', () => {
    const esito = savedViewSchema.safeParse({
      entity: 'pratiche',
      name: 'Da saldare',
      query: 'stato=confermata&pagamento=in_ritardo',
      shared: 'on',
    })
    expect(esito.data?.query).toBe('stato=confermata&pagamento=in_ritardo')
    expect(esito.data?.shared).toBe(true)
  })
})
