import { describe, expect, it } from 'vitest'
import {
  installmentSchema,
  paymentInSchema,
  payoutStatusSchema,
  voidPaymentSchema,
} from '@/lib/validation/incassi'

const UUID = '11111111-1111-4111-8111-111111111111'

const oggi = new Date().toISOString().slice(0, 10)
const domani = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

const incassoBase = {
  booking_id: UUID,
  kind: 'acconto',
  method: 'bonifico',
  amount: '1.234,56',
  paid_at: oggi,
}

describe('schema dell’incasso', () => {
  it('converte l’importo in centesimi interi', () => {
    const esito = paymentInSchema.safeParse(incassoBase)
    expect(esito.success).toBe(true)
    expect(esito.data?.amount).toBe(123_456)
  })

  it('accetta una scadenza collegata e traduce "nessuna" in null', () => {
    const collegato = paymentInSchema.safeParse({ ...incassoBase, installment_id: UUID })
    expect(collegato.data?.installment_id).toBe(UUID)

    const libero = paymentInSchema.safeParse({ ...incassoBase, installment_id: 'nessuna' })
    expect(libero.data?.installment_id).toBeNull()
  })

  it('rifiuta un importo zero o non numerico', () => {
    expect(paymentInSchema.safeParse({ ...incassoBase, amount: '0,00' }).success).toBe(false)
    expect(paymentInSchema.safeParse({ ...incassoBase, amount: 'centoventi' }).success).toBe(false)
  })

  it('rifiuta una data futura', () => {
    const esito = paymentInSchema.safeParse({ ...incassoBase, paid_at: domani })
    expect(esito.success).toBe(false)
    expect(JSON.stringify(esito.error?.issues)).toMatch(/futuro/i)
  })

  it('un rimborso deve essere negativo, un acconto positivo', () => {
    const rimborsoSbagliato = paymentInSchema.safeParse({ ...incassoBase, kind: 'rimborso' })
    expect(rimborsoSbagliato.success).toBe(false)

    const rimborso = paymentInSchema.safeParse({
      ...incassoBase,
      kind: 'rimborso',
      amount: '-150,00',
    })
    expect(rimborso.success).toBe(true)
    expect(rimborso.data?.amount).toBe(-15_000)

    const accontoNegativo = paymentInSchema.safeParse({ ...incassoBase, amount: '-10,00' })
    expect(accontoNegativo.success).toBe(false)
  })

  it('rifiuta un metodo di pagamento inventato', () => {
    expect(paymentInSchema.safeParse({ ...incassoBase, method: 'criptovaluta' }).success).toBe(false)
  })
})

describe('schema dello storno', () => {
  it('pretende un motivo di almeno tre caratteri', () => {
    expect(
      voidPaymentSchema.safeParse({ payment_id: UUID, booking_id: UUID, reason: 'no' }).success,
    ).toBe(false)
    expect(
      voidPaymentSchema.safeParse({
        payment_id: UUID,
        booking_id: UUID,
        reason: 'Bonifico tornato indietro',
      }).success,
    ).toBe(true)
  })
})

describe('schema della scadenza', () => {
  it('accetta una rata nuova senza identificativo', () => {
    const esito = installmentSchema.safeParse({
      booking_id: UUID,
      kind: 'rata',
      due_date: '2030-05-01',
      amount: '500,00',
    })
    expect(esito.success).toBe(true)
    expect(esito.data?.id).toBeNull()
    expect(esito.data?.amount).toBe(50_000)
    expect(esito.data?.sort_order).toBe(0)
  })

  it('rifiuta una data scritta all’italiana', () => {
    const esito = installmentSchema.safeParse({
      booking_id: UUID,
      kind: 'rata',
      due_date: '01/05/2030',
      amount: '500,00',
    })
    expect(esito.success).toBe(false)
  })

  it('rifiuta un tipo di scadenza fuori elenco', () => {
    const esito = installmentSchema.safeParse({
      booking_id: UUID,
      kind: 'caparra',
      due_date: '2030-05-01',
      amount: '500,00',
    })
    expect(esito.success).toBe(false)
  })
})

describe('schema dello stato di un pagamento', () => {
  it('accetta il passaggio a pagato con la data di oggi', () => {
    const esito = payoutStatusSchema.safeParse({
      payout_id: UUID,
      status: 'pagato',
      paid_at: oggi,
    })
    expect(esito.success).toBe(true)
  })

  it('rifiuta un pagamento datato domani', () => {
    const esito = payoutStatusSchema.safeParse({
      payout_id: UUID,
      status: 'pagato',
      paid_at: domani,
    })
    expect(esito.success).toBe(false)
  })

  it('rifiuta uno stato inventato', () => {
    expect(payoutStatusSchema.safeParse({ payout_id: UUID, status: 'forse' }).success).toBe(false)
  })
})
