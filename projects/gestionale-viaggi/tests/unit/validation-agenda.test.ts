import { describe, expect, it } from 'vitest'
import { taskSchema } from '@/lib/validation/agenda'
import {
  impostazioniEmailSchema,
  invioFatturaSchema,
  invioPreventivoSchema,
  promemoriaSchema,
  provaEmailSchema,
} from '@/lib/validation/email'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('attività', () => {
  it('accetta il minimo indispensabile', () => {
    const esito = taskSchema.safeParse({ title: 'Richiamare la signora Bianchi' })
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.kind).toBe('generico')
      expect(esito.data.priority).toBe('media')
      expect(esito.data.status).toBe('aperto')
      expect(esito.data.due_at).toBeNull()
      expect(esito.data.assignee_id).toBeNull()
    }
  })

  it('rifiuta un titolo che non dice niente', () => {
    expect(taskSchema.safeParse({ title: 'x' }).success).toBe(false)
    expect(taskSchema.safeParse({ title: '   ' }).success).toBe(false)
  })

  it('converte la scadenza dall’ora di Roma all’istante salvato', () => {
    // 21 settembre, ora legale: Roma è avanti di due ore su Greenwich.
    const estate = taskSchema.safeParse({ title: 'Chiamare', due_at: '2026-09-21T09:30' })
    expect(estate.success && estate.data.due_at).toBe('2026-09-21T07:30:00.000Z')

    // 21 gennaio, ora solare: un'ora di differenza.
    const inverno = taskSchema.safeParse({ title: 'Chiamare', due_at: '2026-01-21T09:30' })
    expect(inverno.success && inverno.data.due_at).toBe('2026-01-21T08:30:00.000Z')
  })

  it('rifiuta una scadenza che non è una data', () => {
    const esito = taskSchema.safeParse({ title: 'Chiamare', due_at: 'domani mattina' })
    expect(esito.success).toBe(false)
  })

  it('"nessuno" vuol dire nessun riferimento, non un identificativo', () => {
    const esito = taskSchema.safeParse({
      title: 'Chiamare',
      assignee_id: 'nessuno',
      booking_id: '',
      customer_id: UUID,
    })
    expect(esito.success).toBe(true)
    if (esito.success) {
      expect(esito.data.assignee_id).toBeNull()
      expect(esito.data.booking_id).toBeNull()
      expect(esito.data.customer_id).toBe(UUID)
    }
  })

  it('rifiuta un riferimento inventato', () => {
    expect(taskSchema.safeParse({ title: 'Chiamare', booking_id: 'pratica-42' }).success).toBe(false)
  })
})

describe('invio dei messaggi', () => {
  it('pretende un indirizzo scritto bene', () => {
    expect(provaEmailSchema.safeParse({ to: 'mario.rossi@gmail' }).success).toBe(false)
    expect(provaEmailSchema.safeParse({ to: 'mario rossi@gmail.com' }).success).toBe(false)
    expect(provaEmailSchema.safeParse({ to: '' }).success).toBe(false)

    const buono = provaEmailSchema.safeParse({ to: '  Mario.Rossi@Example.IT ' })
    expect(buono.success && buono.data.to).toBe('mario.rossi@example.it')
  })

  it('il preventivo viaggia con il suo identificativo', () => {
    expect(
      invioPreventivoSchema.safeParse({ quote_id: 'non-un-uuid', to: 'a@b.it' }).success,
    ).toBe(false)

    const esito = invioPreventivoSchema.safeParse({
      quote_id: UUID,
      to: 'a@b.it',
      message: '  ',
    })
    expect(esito.success).toBe(true)
    // Un messaggio di soli spazi non è un messaggio.
    expect(esito.success && esito.data.message).toBeNull()
  })

  it('l’allegato è una casella di spunta, e le caselle non spuntate non arrivano', () => {
    const senza = invioFatturaSchema.safeParse({ invoice_id: UUID, to: 'a@b.it' })
    expect(senza.success && senza.data.allega_pdf).toBe(false)

    const con = invioFatturaSchema.safeParse({ invoice_id: UUID, to: 'a@b.it', allega_pdf: 'on' })
    expect(con.success && con.data.allega_pdf).toBe(true)
  })

  it('il promemoria sa a quale rata si riferisce', () => {
    expect(promemoriaSchema.safeParse({ booking_id: UUID, to: 'a@b.it' }).success).toBe(false)
    expect(
      promemoriaSchema.safeParse({ booking_id: UUID, installment_id: UUID, to: 'a@b.it' }).success,
    ).toBe(true)
  })
})

describe('impostazioni della posta', () => {
  it('l’indirizzo di risposta è facoltativo ma deve essere valido', () => {
    const vuoto = impostazioniEmailSchema.safeParse({ email_enabled: 'on' })
    expect(vuoto.success).toBe(true)
    expect(vuoto.success && vuoto.data.email_reply_to).toBeNull()
    expect(vuoto.success && vuoto.data.email_enabled).toBe(true)

    expect(
      impostazioniEmailSchema.safeParse({ email_reply_to: 'non-un-indirizzo' }).success,
    ).toBe(false)
  })

  it('l’interruttore spento significa spento', () => {
    const esito = impostazioniEmailSchema.safeParse({ email_from_name: 'Orizzonti Viaggi' })
    expect(esito.success && esito.data.email_enabled).toBe(false)
  })

  it('la firma non può diventare un romanzo', () => {
    const lunga = 'a'.repeat(501)
    expect(impostazioniEmailSchema.safeParse({ email_signature: lunga }).success).toBe(false)
  })
})
