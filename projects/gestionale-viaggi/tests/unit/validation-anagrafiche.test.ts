import { describe, expect, it } from 'vitest'
import { customerSchema, passengerSchema, supplierSchema } from '@/lib/validation/anagrafiche'

const clienteBase = {
  kind: 'privato' as const,
  last_name: 'Rossi',
  first_name: 'Mario',
  country: 'IT',
}

describe('schema cliente', () => {
  it('accetta un privato con il solo cognome', () => {
    const result = customerSchema.safeParse(clienteBase)
    expect(result.success).toBe(true)
  })

  it('pretende la ragione sociale per un azienda', () => {
    const result = customerSchema.safeParse({ ...clienteBase, kind: 'azienda', last_name: '', first_name: '' })
    expect(result.success).toBe(false)
  })

  it('trasforma i campi vuoti in null invece di stringhe vuote', () => {
    const result = customerSchema.parse({ ...clienteBase, email: '', city: '', notes: '' })
    expect(result.email).toBeNull()
    expect(result.city).toBeNull()
    expect(result.notes).toBeNull()
  })

  it('normalizza i tag: minuscoli, senza spazi, senza duplicati', () => {
    const result = customerSchema.parse({ ...clienteBase, tags: ' VIP , famiglia,  vip ,, ' })
    expect(result.tags).toEqual(['vip', 'famiglia'])
  })

  it('pretende la cifra di controllo su una partita IVA italiana', () => {
    expect(customerSchema.safeParse({ ...clienteBase, vat_number: '00743110157' }).success).toBe(true)
    expect(customerSchema.safeParse({ ...clienteBase, vat_number: '00743110158' }).success).toBe(false)
    // Una cifra saltata non passa come "identificativo estero"
    expect(customerSchema.safeParse({ ...clienteBase, vat_number: '0074311015' }).success).toBe(false)
  })

  it('accetta un identificativo fiscale estero', () => {
    const result = customerSchema.safeParse({ ...clienteBase, vat_number: 'ES-B12345678' })
    expect(result.success).toBe(true)
  })

  it('verifica il codice fiscale italiano e accetta quello estero', () => {
    expect(customerSchema.safeParse({ ...clienteBase, tax_code: 'RSSMRA85T10A562S' }).success).toBe(true)
    expect(customerSchema.safeParse({ ...clienteBase, tax_code: 'RSSMRA85T10A562A' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...clienteBase, tax_code: 'TZ-114-882-901' }).success).toBe(true)
  })

  it('controlla CAP e provincia', () => {
    expect(customerSchema.safeParse({ ...clienteBase, postal_code: '2110' }).success).toBe(false)
    expect(customerSchema.safeParse({ ...clienteBase, province: 'VAR' }).success).toBe(false)
    const ok = customerSchema.parse({ ...clienteBase, postal_code: '21100', province: 'va' })
    expect(ok.province).toBe('VA')
  })

  it('interpreta le caselle di consenso non selezionate come no', () => {
    const senza = customerSchema.parse(clienteBase)
    expect(senza.marketing_consent).toBe(false)
    const con = customerSchema.parse({ ...clienteBase, marketing_consent: 'on' })
    expect(con.marketing_consent).toBe(true)
  })
})

describe('schema passeggero', () => {
  const base = { first_name: 'Anna', last_name: 'Verdi', nationality: 'IT' }

  it('pretende nome e cognome', () => {
    expect(passengerSchema.safeParse({ ...base, last_name: '' }).success).toBe(false)
  })

  it('rifiuta una scadenza documento anteriore al rilascio', () => {
    const result = passengerSchema.safeParse({
      ...base,
      document_type: 'passaporto',
      document_number: 'YA1234567',
      document_issued_at: '2026-06-01',
      document_expires_at: '2026-01-01',
    })
    expect(result.success).toBe(false)
  })

  it('pretende il numero quando è indicato il tipo di documento', () => {
    const result = passengerSchema.safeParse({ ...base, document_type: 'passaporto' })
    expect(result.success).toBe(false)
  })

  it('accetta un passeggero senza documento', () => {
    expect(passengerSchema.safeParse(base).success).toBe(true)
  })

  it('tratta "nessuno" come assenza di cliente collegato', () => {
    const result = passengerSchema.parse({ ...base, customer_id: 'nessuno' })
    expect(result.customer_id).toBeNull()
  })
})

describe('schema fornitore', () => {
  const base = {
    kind: 'tour_operator' as const,
    name: 'Mediterranea Tour',
    country: 'IT',
    payment_terms_days: 30,
    default_commission_percent: 12,
    default_vat_regime: 'art_74_ter' as const,
  }

  it('converte la commissione da percentuale a numero', () => {
    const result = supplierSchema.parse({ ...base, default_commission_percent: '12.5' })
    expect(result.default_commission_percent).toBe(12.5)
  })

  it('rifiuta condizioni di pagamento impossibili', () => {
    expect(supplierSchema.safeParse({ ...base, payment_terms_days: -1 }).success).toBe(false)
    expect(supplierSchema.safeParse({ ...base, payment_terms_days: 400 }).success).toBe(false)
    expect(supplierSchema.safeParse({ ...base, default_commission_percent: 120 }).success).toBe(false)
  })

  it('verifica l IBAN', () => {
    expect(supplierSchema.safeParse({ ...base, iban: 'IT60X0542811101000000123456' }).success).toBe(true)
    expect(supplierSchema.safeParse({ ...base, iban: 'IT60X0542811101000000123457' }).success).toBe(false)
  })

  it('normalizza l IBAN togliendo gli spazi', () => {
    const result = supplierSchema.parse({ ...base, iban: 'it60 x054 2811 1010 0000 0123 456' })
    expect(result.iban).toBe('IT60X0542811101000000123456')
  })
})
