import { describe, expect, it } from 'vitest'
import { INVOICE_PAYMENT_STATE, isInvoicePaymentState, nomeMese } from '@/lib/labels'
import {
  creditNoteSchema,
  invoiceItemSchema,
  invoiceSchema,
  issueInvoiceSchema,
} from '@/lib/validation/fatture'

const UUID = '11111111-1111-4111-8111-111111111111'

const oggi = new Date().toISOString().slice(0, 10)
const domani = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
const ieri = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

const testataBase = {
  customer_id: UUID,
  issue_date: oggi,
  vat_regime: 'art_74_ter',
}

const rigaBase = {
  invoice_id: UUID,
  description: 'Pacchetto turistico Lisbona, 7 notti',
  quantity: '1',
  unit_price: '1.500,00',
  cost: '1.000,00',
  vat_percent: '22',
  vat_regime: 'art_74_ter',
  sort_order: '0',
}

describe('schema della testata', () => {
  it('accetta il minimo e traduce "nessuna" pratica in null', () => {
    const esito = invoiceSchema.safeParse({ ...testataBase, booking_id: 'nessuna' })
    expect(esito.success).toBe(true)
    expect(esito.data?.booking_id).toBeNull()
    expect(esito.data?.vat_regime).toBe('art_74_ter')
  })

  it('rifiuta una data di emissione nel futuro', () => {
    const esito = invoiceSchema.safeParse({ ...testataBase, issue_date: domani })
    expect(esito.success).toBe(false)
    expect(JSON.stringify(esito.error?.issues)).toMatch(/futuro/i)
  })

  it('rifiuta una scadenza che precede l’emissione', () => {
    const esito = invoiceSchema.safeParse({ ...testataBase, due_date: ieri })
    expect(esito.success).toBe(false)
    expect(esito.error?.issues[0]?.path).toEqual(['due_date'])
  })

  it('pretende il cliente intestatario', () => {
    const esito = invoiceSchema.safeParse({ ...testataBase, customer_id: '' })
    expect(esito.success).toBe(false)
  })

  it('rifiuta un regime IVA inventato', () => {
    expect(invoiceSchema.safeParse({ ...testataBase, vat_regime: 'forfait' }).success).toBe(false)
  })
})

describe('schema della riga', () => {
  it('converte importi e aliquota in interi', () => {
    const esito = invoiceItemSchema.safeParse(rigaBase)
    expect(esito.success).toBe(true)
    expect(esito.data?.unit_price).toBe(150_000)
    expect(esito.data?.cost).toBe(100_000)
    expect(esito.data?.vat_percent).toBe(2200)
  })

  it('accetta un costo a zero: fuori dal 74-ter non incide', () => {
    const esito = invoiceItemSchema.safeParse({
      ...rigaBase,
      cost: '0',
      vat_regime: 'ordinaria',
    })
    expect(esito.success).toBe(true)
    expect(esito.data?.cost).toBe(0)
  })

  it('rifiuta una descrizione vuota e un importo non numerico', () => {
    expect(invoiceItemSchema.safeParse({ ...rigaBase, description: ' ' }).success).toBe(false)
    expect(invoiceItemSchema.safeParse({ ...rigaBase, unit_price: 'mille' }).success).toBe(false)
  })
})

describe('schemi delle operazioni', () => {
  it('l’emissione vuole un documento e una data non futura', () => {
    expect(issueInvoiceSchema.safeParse({ id: UUID, issue_date: oggi }).success).toBe(true)
    expect(issueInvoiceSchema.safeParse({ id: UUID, issue_date: domani }).success).toBe(false)
    expect(issueInvoiceSchema.safeParse({ id: 'x', issue_date: oggi }).success).toBe(false)
  })

  it('la nota di credito pretende un motivo', () => {
    expect(
      creditNoteSchema.safeParse({ invoice_id: UUID, reason: 'Annullamento del viaggio' }).success,
    ).toBe(true)
    expect(creditNoteSchema.safeParse({ invoice_id: UUID, reason: ' ' }).success).toBe(false)
  })
})

describe('etichette dell’amministrazione', () => {
  it('ogni stato di incasso ha un testo, non solo un colore', () => {
    for (const stato of Object.values(INVOICE_PAYMENT_STATE)) {
      expect(stato.label.trim().length).toBeGreaterThan(0)
    }
    expect(isInvoicePaymentState('pagata')).toBe(true)
    expect(isInvoicePaymentState('inventato')).toBe(false)
  })

  it('i mesi del registro si scrivono per esteso', () => {
    expect(nomeMese(1)).toBe('gennaio')
    expect(nomeMese(12)).toBe('dicembre')
    expect(nomeMese(13)).toBe('')
  })
})
