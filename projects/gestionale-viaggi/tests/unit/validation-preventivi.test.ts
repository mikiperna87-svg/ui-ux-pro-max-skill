import { describe, expect, it } from 'vitest'
import { QUOTE_STATUS, QUOTE_VARIANT, varianteConArticolo } from '@/lib/labels'
import {
  acceptQuoteSchema,
  copyVariantSchema,
  quoteItemSchema,
  quoteSchema,
  rejectQuoteSchema,
} from '@/lib/validation/preventivi'

const UUID = '11111111-1111-4111-8111-111111111111'
const ALTRO_UUID = '22222222-2222-4222-8222-222222222222'

const preventivoBase = {
  title: 'Viaggio di nozze',
  destination: 'Zanzibar',
  pax_count: '2',
  sale_type: 'organizzazione',
}

const rigaBase = {
  quote_id: UUID,
  variant: 'consigliata',
  service_type: 'hotel',
  description: 'Resort fronte mare, mezza pensione',
  quantity: '1',
  unit_cost: '1.200,00',
  unit_price: '1.650,00',
  commission_percent: '',
  commission_override: '',
  vat_percent: '22',
  vat_regime: 'art_74_ter',
  sort_order: '0',
}

describe('schema del preventivo', () => {
  it('accetta il minimo indispensabile e traduce "nessuno" in null', () => {
    const esito = quoteSchema.safeParse({
      ...preventivoBase,
      customer_id: 'nessuno',
      owner_id: 'nessuno',
    })
    expect(esito.success).toBe(true)
    expect(esito.data?.customer_id).toBeNull()
    expect(esito.data?.owner_id).toBeNull()
    expect(esito.data?.pax_count).toBe(2)
  })

  it('rifiuta un rientro che precede la partenza', () => {
    const esito = quoteSchema.safeParse({
      ...preventivoBase,
      departure_date: '2030-06-10',
      return_date: '2030-06-03',
    })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.path).toEqual(['return_date'])
  })

  it('rifiuta un titolo vuoto e un numero di passeggeri fuori scala', () => {
    expect(quoteSchema.safeParse({ ...preventivoBase, title: ' ' }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...preventivoBase, pax_count: '0' }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...preventivoBase, pax_count: '501' }).success).toBe(false)
  })

  it('rifiuta un tipo di vendita inventato', () => {
    expect(quoteSchema.safeParse({ ...preventivoBase, sale_type: 'permuta' }).success).toBe(false)
  })
})

describe('schema della riga di proposta', () => {
  it('converte gli importi in centesimi interi e la percentuale in punti base', () => {
    const esito = quoteItemSchema.safeParse(rigaBase)
    expect(esito.success).toBe(true)
    expect(esito.data?.unit_cost).toBe(120_000)
    expect(esito.data?.unit_price).toBe(165_000)
    expect(esito.data?.vat_percent).toBe(2200)
  })

  it('accetta prezzo e costo a zero: una voce può essere inclusa nel pacchetto', () => {
    const esito = quoteItemSchema.safeParse({ ...rigaBase, unit_cost: '0', unit_price: '0' })
    expect(esito.success).toBe(true)
    expect(esito.data?.unit_price).toBe(0)
  })

  it('rifiuta una data finale che precede quella iniziale', () => {
    const esito = quoteItemSchema.safeParse({
      ...rigaBase,
      date_from: '2030-06-10',
      date_to: '2030-06-08',
    })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.path).toEqual(['date_to'])
  })

  it('rifiuta una variante o un servizio non previsti', () => {
    expect(quoteItemSchema.safeParse({ ...rigaBase, variant: 'lusso' }).success).toBe(false)
    expect(quoteItemSchema.safeParse({ ...rigaBase, service_type: 'crociera' }).success).toBe(false)
  })
})

describe('schema della copia fra proposte', () => {
  it('accetta un ritocco percentuale e lo porta in punti base', () => {
    const esito = copyVariantSchema.safeParse({
      quote_id: UUID,
      from: 'consigliata',
      to: 'premium',
      adjust_percent: '15',
    })
    expect(esito.success).toBe(true)
    expect(esito.data?.adjust_percent).toBe(1500)
  })

  it('rifiuta la copia di una proposta su sé stessa', () => {
    const esito = copyVariantSchema.safeParse({
      quote_id: UUID,
      from: 'premium',
      to: 'premium',
      adjust_percent: '0',
    })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.path).toEqual(['to'])
  })
})

describe('schemi della pagina pubblica', () => {
  it('l’accettazione vuole un token valido, una proposta e un nome', () => {
    const esito = acceptQuoteSchema.safeParse({
      token: ALTRO_UUID,
      variant: 'base',
      name: 'Giulia Bianchi',
    })
    expect(esito.success).toBe(true)

    expect(
      acceptQuoteSchema.safeParse({ token: 'non-un-token', variant: 'base', name: 'Giulia' })
        .success,
    ).toBe(false)
    expect(
      acceptQuoteSchema.safeParse({ token: ALTRO_UUID, variant: 'base', name: 'G' }).success,
    ).toBe(false)
    expect(
      acceptQuoteSchema.safeParse({ token: ALTRO_UUID, variant: 'lusso', name: 'Giulia' }).success,
    ).toBe(false)
  })

  it('il rifiuto non obbliga a spiegare il motivo', () => {
    const senzaMotivo = rejectQuoteSchema.safeParse({ token: ALTRO_UUID })
    expect(senzaMotivo.success).toBe(true)
    expect(senzaMotivo.data?.reason).toBeNull()

    const conMotivo = rejectQuoteSchema.safeParse({ token: ALTRO_UUID, reason: 'Fuori budget' })
    expect(conMotivo.data?.reason).toBe('Fuori budget')
  })
})

describe('etichette delle proposte', () => {
  it('l’articolo si elide davanti a vocale', () => {
    // "Accetto la essenziale" è la frase che legge il cliente: deve essere
    // italiano corretto, non una concatenazione.
    expect(varianteConArticolo('base')).toBe('l’essenziale')
    expect(varianteConArticolo('consigliata')).toBe('la consigliata')
    expect(varianteConArticolo('premium')).toBe('la premium')
  })

  it('ogni stato del preventivo ha un testo, non solo un colore', () => {
    for (const stato of Object.values(QUOTE_STATUS)) {
      expect(stato.label.trim().length).toBeGreaterThan(0)
    }
    for (const variante of Object.values(QUOTE_VARIANT)) {
      expect(variante.label.trim().length).toBeGreaterThan(0)
      expect(variante.note.trim().length).toBeGreaterThan(0)
    }
  })
})
