import { describe, expect, it } from 'vitest'
import type { Tables } from '@/lib/database.types'
import { formatEuro } from '@/lib/money'
import {
  messaggioFattura,
  messaggioPreventivo,
  messaggioPromemoria,
  messaggioProva,
} from '@/server/email/modelli'

/**
 * I modelli delle email.
 *
 * Un messaggio sbagliato non si scopre in sviluppo: si scopre dal cliente che
 * riceve "Gentile undefined" o un collegamento rotto. Qui si verifica che le
 * due versioni — HTML e testo — dicano le stesse cose, che l'intestazione
 * dell'agenzia ci sia sempre e che il testo di chi scrive non possa iniettare
 * marcatori nella pagina del messaggio.
 */
const AGENZIA = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Orizzonti Viaggi',
  legal_name: 'Orizzonti Viaggi S.r.l.',
  vat_number: 'IT03344556677',
  email: 'info@orizzontiviaggi.it',
  phone: '+39 02 1234567',
  website: 'https://orizzontiviaggi.it',
  address_line: 'Via Dante 12',
  postal_code: '20121',
  city: 'Milano',
  province: 'MI',
} as unknown as Tables<'agencies'>

const MITTENTE = { agency: AGENZIA, firma: 'Un caro saluto,\nGiulia' }

describe('messaggio del preventivo', () => {
  const messaggio = messaggioPreventivo({
    mittente: MITTENTE,
    destinatarioNome: 'Marco Bianchi',
    quote: {
      code: 'P2026/0042',
      title: 'Capodanno in Lapponia',
      destination: 'Rovaniemi',
      departure_date: '2026-12-28',
      pax_count: 4,
      valid_until: '2026-11-30',
    },
    link: 'https://gestionale.example.it/preventivo/abc-123',
    testoLibero: 'Come d’accordo al telefono.',
  })

  it('porta codice e destinazione nell’oggetto', () => {
    expect(messaggio.subject).toContain('P2026/0042')
    expect(messaggio.subject).toContain('Rovaniemi')
  })

  it('contiene il collegamento pubblico in entrambe le versioni', () => {
    expect(messaggio.html).toContain('https://gestionale.example.it/preventivo/abc-123')
    expect(messaggio.text).toContain('https://gestionale.example.it/preventivo/abc-123')
  })

  it('riporta il testo scritto dall’operatore e la firma', () => {
    expect(messaggio.html).toContain('Come d’accordo al telefono.')
    expect(messaggio.text).toContain('Come d’accordo al telefono.')
    expect(messaggio.text).toContain('Un caro saluto,')
  })

  it('mostra i dati del viaggio con le date in italiano', () => {
    expect(messaggio.text).toContain('28 dicembre 2026')
    expect(messaggio.text).toContain('30/11/2026')
    expect(messaggio.text).toContain('Partecipanti: 4')
  })

  it('chiude con l’intestazione dell’agenzia', () => {
    expect(messaggio.html).toContain('Orizzonti Viaggi S.r.l.')
    expect(messaggio.html).toContain('IT03344556677')
    expect(messaggio.text).toContain('Via Dante 12 · 20121 Milano · MI')
  })
})

describe('sicurezza del contenuto', () => {
  it('neutralizza i marcatori scritti a mano', () => {
    // Il testo libero arriva da un campo dell'applicazione: se finisse
    // nell'HTML senza essere neutralizzato, un nome incollato da un'email
    // potrebbe portarsi dietro marcatori.
    const messaggio = messaggioPreventivo({
      mittente: MITTENTE,
      destinatarioNome: '<script>alert(1)</script>',
      quote: {
        code: 'P2026/0001',
        title: 'Viaggio',
        destination: 'Roma',
        departure_date: null,
        pax_count: 2,
        valid_until: null,
      },
      link: 'https://example.it/p/1',
      testoLibero: '<b>grassetto</b>',
    })

    expect(messaggio.html).not.toContain('<script>')
    expect(messaggio.html).toContain('&lt;script&gt;')
    expect(messaggio.html).not.toContain('<b>grassetto</b>')
  })
})

describe('messaggio della fattura', () => {
  it('dice che il documento è in allegato quando c’è', () => {
    const messaggio = messaggioFattura({
      mittente: MITTENTE,
      destinatarioNome: 'Marco Bianchi',
      invoice: {
        code: '2026/0007',
        kind: 'fattura',
        issue_date: '2026-09-01',
        due_date: '2026-10-01',
        total_cents: 125_000,
      },
      bookingCode: '2026/0031',
      allegato: true,
    })

    expect(messaggio.subject).toBe('Fattura 2026/0007')
    expect(messaggio.text).toContain('in allegato')
    expect(messaggio.text).toContain(formatEuro(125_000))
    expect(messaggio.text).toContain('2026/0031')
    expect(messaggio.text).toContain('01/10/2026')
  })

  it('senza allegato spiega come ottenere il documento', () => {
    const messaggio = messaggioFattura({
      mittente: MITTENTE,
      destinatarioNome: 'Marco Bianchi',
      invoice: {
        code: '2026/0007',
        kind: 'fattura',
        issue_date: '2026-09-01',
        due_date: null,
        total_cents: 125_000,
      },
      allegato: false,
    })

    expect(messaggio.text).toContain('disponibile in agenzia')
  })

  it('una nota di credito si presenta per quello che è', () => {
    const messaggio = messaggioFattura({
      mittente: MITTENTE,
      destinatarioNome: 'Marco Bianchi',
      invoice: {
        code: 'NC2026/0002',
        kind: 'nota_credito',
        issue_date: '2026-09-10',
        due_date: null,
        total_cents: 50_000,
      },
      allegato: true,
    })

    expect(messaggio.subject).toBe('Nota di credito NC2026/0002')
    expect(messaggio.text).toContain('storna')
    expect(messaggio.text).toContain(`− ${formatEuro(50_000)}`)
  })
})

describe('promemoria di pagamento', () => {
  const messaggio = messaggioPromemoria({
    mittente: MITTENTE,
    destinatarioNome: 'Marco Bianchi',
    booking: {
      code: '2026/0031',
      title: 'Settimana a Taormina',
      destination: 'Taormina',
      departure_date: '2026-10-12',
    },
    importoCents: 89_000,
    scadenza: '2026-09-30',
  })

  it('riporta importo, scadenza e pratica', () => {
    expect(messaggio.subject).toContain('2026/0031')
    expect(messaggio.text).toContain(formatEuro(89_000))
    expect(messaggio.text).toContain('30/09/2026')
  })

  it('mette le mani avanti con chi ha già pagato', () => {
    // È l'errore che fa più danni con un cliente: un sollecito arrivato dopo
    // il bonifico. La frase non toglie il problema, ma lo spiega.
    expect(messaggio.text).toContain('già effettuato il pagamento')
  })
})

describe('messaggio di prova', () => {
  it('dice a chi è stato mandato e perché', () => {
    const messaggio = messaggioProva({ mittente: MITTENTE, destinatario: 'tu@example.it' })
    expect(messaggio.subject).toContain('Prova')
    expect(messaggio.text).toContain('tu@example.it')
    expect(messaggio.html).toContain('Orizzonti Viaggi')
  })
})
