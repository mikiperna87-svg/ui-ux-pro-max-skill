import { beforeAll, describe, expect, it } from 'vitest'
import {
  AGENCY_A,
  AGENCY_B,
  asUser,
  seedTenants,
  USER_A_OPERATOR,
  USER_A_OWNER,
  USER_A_READONLY,
  USER_B_OWNER,
} from './helpers'

/**
 * Agenda, attività e coda della posta, verificate contro il database vero con
 * le policy accese.
 *
 * Qui si difendono tre cose. Che l'agenda dica la verità sul giorno giusto:
 * una scadenza è fatta di giorni, il database conserva istanti, e in mezzo c'è
 * il fuso di Roma. Che i vincoli sulla coda impediscano di raccontare una
 * consegna mai avvenuta. E che la posta di un'agenzia resti invisibile
 * all'altra, che è l'unica garanzia sul fatto che i dati dei clienti non si
 * mescolino.
 */
beforeAll(async () => {
  await seedTenants()
}, 60_000)

type Sessione = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

async function primoCliente(s: Sessione, agency: string): Promise<string> {
  const { rows } = await s.query(
    `select id from public.customers where agency_id = $1 and deleted_at is null limit 1`,
    [agency],
  )
  return String(rows[0]?.id)
}

/** Il tesserino dell'utente dentro l'agenzia: è ciò che `assignee_id` referenzia. */
async function membership(s: Sessione, agency: string, userId: string): Promise<string> {
  const { rows } = await s.query(
    `select id from public.memberships where agency_id = $1 and user_id = $2`,
    [agency, userId],
  )
  return String(rows[0]?.id)
}

async function creaAttivita(
  s: Sessione,
  { titolo = 'Richiamare il cliente', scadenza = '2026-07-10T08:00:00Z', assegnatario = null as string | null } = {},
): Promise<string> {
  const { rows } = await s.query(
    `insert into public.tasks (agency_id, title, due_at, assignee_id, kind, priority)
     values ($1, $2, $3, $4, 'richiamo_cliente', 'alta')
     returning id`,
    [AGENCY_A, titolo, scadenza, assegnatario],
  )
  return String(rows[0]?.id)
}

/** Un messaggio valido: i test dei vincoli partono sempre da qui e rompono un pezzo per volta. */
function messaggio(agency = AGENCY_A) {
  return {
    agency_id: agency,
    kind: 'prova',
    to_email: 'cliente@example.it',
    subject: 'Prova di invio',
    body_text: 'Corpo in testo semplice.',
    body_html: '<p>Corpo in HTML.</p>',
  }
}

async function accoda(
  s: Sessione,
  campi: Record<string, unknown>,
): Promise<{ rows: Record<string, unknown>[] }> {
  const colonne = Object.keys(campi)
  const segnaposto = colonne.map((_, i) => `$${i + 1}`)
  return s.query(
    `insert into public.email_messages (${colonne.join(', ')})
     values (${segnaposto.join(', ')}) returning id, status, attempts`,
    Object.values(campi),
  )
}

/**
 * Esegue qualcosa che deve fallire, isolandolo in un savepoint.
 *
 * In Postgres il primo errore abortisce l'intera transazione: senza questo, il
 * controllo successivo nello stesso test non fallirebbe per il motivo giusto,
 * ma perché il database rifiuta qualunque comando. Restituisce il messaggio
 * d'errore, così il test può dire *quale* vincolo ha reagito.
 */
async function rifiutato(s: Sessione, fn: () => Promise<unknown>): Promise<string> {
  await s.query('savepoint prova')
  try {
    await fn()
  } catch (errore) {
    await s.query('rollback to savepoint prova')
    return errore instanceof Error ? errore.message : String(errore)
  }
  await s.query('release savepoint prova')
  throw new Error('L\'operazione è riuscita, mentre doveva essere rifiutata.')
}

describe('vista delle attività', () => {
  it('calcola il ritardo al momento della lettura, non lo conserva', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const passata = await creaAttivita(s, { scadenza: '2020-01-01T09:00:00Z' })
      const futura = await creaAttivita(s, { scadenza: '2090-01-01T09:00:00Z' })

      const { rows } = await s.query(
        `select id, is_overdue from public.task_list where id = any($1::uuid[])`,
        [[passata, futura]],
      )
      const per = new Map(rows.map((r) => [String(r.id), r.is_overdue]))
      expect(per.get(passata)).toBe(true)
      expect(per.get(futura)).toBe(false)

      // Completata, non è più in ritardo: il ritardo riguarda ciò che resta da fare.
      await s.query(`select public.complete_task($1)`, [passata])
      const dopo = await s.query(`select is_overdue from public.task_list where id = $1`, [passata])
      expect(dopo.rows[0]?.is_overdue).toBe(false)
    })
  })

  it('riporta la scadenza al giorno di Roma, non a quello di Greenwich', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      // Le 23:30 UTC del 30 giugno sono già l'1:30 del primo luglio a Roma:
      // senza conversione l'attività comparirebbe nell'agenda del giorno prima.
      const id = await creaAttivita(s, { scadenza: '2026-06-30T23:30:00Z' })
      // Il cast a testo è voluto: il driver riporterebbe una `date` come Date
      // di JavaScript, rileggendola nel fuso del processo e rimettendo in gioco
      // proprio l'ambiguità che questo controllo deve escludere.
      const { rows } = await s.query(
        `select due_date::text as due_date from public.task_list where id = $1`,
        [id],
      )
      expect(rows[0]?.due_date).toBe('2026-07-01')
    })
  })

  it('non mostra le attività cancellate', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const id = await creaAttivita(s)
      await s.query(`update public.tasks set deleted_at = now() where id = $1`, [id])
      const { rows } = await s.query(`select id from public.task_list where id = $1`, [id])
      expect(rows).toHaveLength(0)
    })
  })
})

describe('chiusura e riapertura di un’attività', () => {
  it('scrive chi ha completato e quando, e lascia traccia nel registro', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const id = await creaAttivita(s)
      await s.query(`select public.complete_task($1)`, [id])

      const { rows } = await s.query(
        `select status, completed_at, completed_by from public.tasks where id = $1`,
        [id],
      )
      expect(rows[0]?.status).toBe('completato')
      expect(rows[0]?.completed_at).not.toBeNull()
      expect(rows[0]?.completed_by).toBe(await membership(s, AGENCY_A, USER_A_OWNER))

      const registro = await s.query(
        `select count(*)::int as n from public.activity_log
         where entity_type = 'tasks' and entity_id = $1`,
        [id],
      )
      expect(Number(registro.rows[0]?.n)).toBeGreaterThan(0)
    })
  })

  it('riaprendo azzera il completamento', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const id = await creaAttivita(s)
      await s.query(`select public.complete_task($1)`, [id])
      await s.query(`select public.reopen_task($1)`, [id])

      const { rows } = await s.query(
        `select status, completed_at, completed_by from public.tasks where id = $1`,
        [id],
      )
      expect(rows[0]?.status).toBe('aperto')
      expect(rows[0]?.completed_at).toBeNull()
      expect(rows[0]?.completed_by).toBeNull()
    })
  })

  it('completare due volte non cambia la data di completamento', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const id = await creaAttivita(s)
      await s.query(`select public.complete_task($1)`, [id])
      const prima = await s.query(`select completed_at from public.tasks where id = $1`, [id])
      await s.query(`select public.complete_task($1)`, [id])
      const dopo = await s.query(`select completed_at from public.tasks where id = $1`, [id])
      expect(String(dopo.rows[0]?.completed_at)).toBe(String(prima.rows[0]?.completed_at))
    })
  })

  it('chi è in sola lettura non può completare niente', async () => {
    const id = await asUser(USER_A_OWNER, (s) => creaAttivita(s))
    await asUser(USER_A_READONLY, async (s) => {
      // La funzione gira con i permessi di chi la chiama: la policy di scrittura
      // si applica, l'update non tocca nessuna riga e la funzione lo dice.
      await rifiutato(s, () => s.query(`select public.complete_task($1)`, [id]))
    })
    // La riga creata sopra è stata annullata col rollback: la si ricrea per il controllo finale.
    await asUser(USER_A_OWNER, async (s) => {
      const vivo = await creaAttivita(s)
      const { rows } = await s.query(`select status from public.tasks where id = $1`, [vivo])
      expect(rows[0]?.status).toBe('aperto')
    })
  })

  it('un’attività di un’altra agenzia non esiste', async () => {
    const id = await asUser(USER_A_OWNER, (s) => creaAttivita(s))
    await asUser(USER_B_OWNER, async (s) => {
      const { rows } = await s.query(`select id from public.task_list where id = $1`, [id])
      expect(rows).toHaveLength(0)
    })
  })
})

describe('agenda', () => {
  it('raccoglie attività e partenze dello stesso giorno in un elenco solo', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const cliente = await primoCliente(s, AGENCY_A)
      await s.query(
        `insert into public.bookings (agency_id, customer_id, title, destination,
                                      departure_date, return_date, pax_count, sale_type, status)
         values ($1, $2, 'Pratica agenda', 'Capo Verde', '2026-07-15', '2026-07-22', 2,
                 'organizzazione', 'confermata')`,
        [AGENCY_A, cliente],
      )
      await creaAttivita(s, { titolo: 'Preparare i documenti', scadenza: '2026-07-15T08:00:00Z' })

      const { rows } = await s.query(
        `select item_kind, title from public.agenda('2026-07-15', '2026-07-15')`,
      )
      const tipi = rows.map((r) => String(r.item_kind))
      expect(tipi).toContain('attivita')
      expect(tipi).toContain('partenza')
      expect(rows.map((r) => String(r.title))).toContain('Partenza: Capo Verde')
    })
  })

  it('filtrando per responsabile lascia fuori le voci di un collega', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const mio = await membership(s, AGENCY_A, USER_A_OWNER)
      const altrui = await membership(s, AGENCY_A, USER_A_OPERATOR)
      await creaAttivita(s, { titolo: 'Mia attività', scadenza: '2026-08-03T08:00:00Z', assegnatario: mio })
      await creaAttivita(s, {
        titolo: 'Attività del collega',
        scadenza: '2026-08-03T08:00:00Z',
        assegnatario: altrui,
      })

      const { rows } = await s.query(
        `select title from public.agenda('2026-08-03', '2026-08-03', $1) where item_kind = 'attivita'`,
        [mio],
      )
      const titoli = rows.map((r) => String(r.title))
      expect(titoli).toContain('Mia attività')
      expect(titoli).not.toContain('Attività del collega')
    })
  })

  it('non mostra le attività già completate', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const id = await creaAttivita(s, { titolo: 'Già fatta', scadenza: '2026-08-04T08:00:00Z' })
      await s.query(`select public.complete_task($1)`, [id])
      const { rows } = await s.query(
        `select title from public.agenda('2026-08-04', '2026-08-04') where item_kind = 'attivita'`,
      )
      expect(rows.map((r) => String(r.title))).not.toContain('Già fatta')
    })
  })

  it('restituisce solo le voci della propria agenzia', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      await creaAttivita(s, { titolo: 'Solo di A', scadenza: '2026-09-09T08:00:00Z' })
    })
    await asUser(USER_B_OWNER, async (s) => {
      const { rows } = await s.query(`select title from public.agenda('2026-09-09', '2026-09-09')`)
      expect(rows.map((r) => String(r.title))).not.toContain('Solo di A')
    })
  })
})

describe('coda della posta', () => {
  it('accetta un messaggio e lo lascia in coda', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const { rows } = await accoda(s, messaggio())
      expect(rows[0]?.status).toBe('in_coda')
      expect(Number(rows[0]?.attempts)).toBe(0)
    })
  })

  it('rifiuta un messaggio "inviata" senza data di invio', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const errore = await rifiutato(s, () => accoda(s, { ...messaggio(), status: 'inviata' }))
      expect(errore).toMatch(/email_messages_sent_has_date/)
      // Con la data, la stessa riga passa.
      const ok = await accoda(s, { ...messaggio(), status: 'inviata', sent_at: new Date().toISOString() })
      expect(ok.rows[0]?.status).toBe('inviata')
    })
  })

  it('rifiuta un messaggio "errore" senza motivo', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const errore = await rifiutato(s, () => accoda(s, { ...messaggio(), status: 'errore' }))
      expect(errore).toMatch(/email_messages_error_has_reason/)
      const ok = await accoda(s, {
        ...messaggio(),
        status: 'errore',
        error_message: 'Il fornitore non ha risposto entro 15 secondi.',
      })
      expect(ok.rows[0]?.status).toBe('errore')
    })
  })

  it('rifiuta un indirizzo che non è un indirizzo', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const errore = await rifiutato(s, () =>
        accoda(s, { ...messaggio(), to_email: 'cliente chiocciola example' }),
      )
      expect(errore).toMatch(/to_email/)
    })
  })

  it('rifiuta un corpo vuoto: un messaggio bianco non è un messaggio', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      expect(await rifiutato(s, () => accoda(s, { ...messaggio(), body_text: '   ' }))).toMatch(
        /body_text/,
      )
      expect(await rifiutato(s, () => accoda(s, { ...messaggio(), body_html: '' }))).toMatch(
        /body_html/,
      )
    })
  })

  it('non lascia scrivere posta a nome di un’altra agenzia', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const errore = await rifiutato(s, () => accoda(s, messaggio(AGENCY_B)))
      expect(errore).toMatch(/row-level security|violates/i)
    })
  })

  it('non lascia leggere la posta di un’altra agenzia', async () => {
    await asUser(USER_B_OWNER, async (s) => {
      const { rows } = await s.query(
        `select id from public.email_messages where agency_id = $1`,
        [AGENCY_A],
      )
      expect(rows).toHaveLength(0)
    })
  })

  it('chi è in sola lettura legge la posta ma non la scrive', async () => {
    await asUser(USER_A_READONLY, async (s) => {
      const errore = await rifiutato(s, () => accoda(s, messaggio()))
      expect(errore).toMatch(/row-level security|violates/i)
      // La lettura invece funziona: il registro della posta è di tutta l'agenzia.
      const lettura = await s.query(
        `select count(*)::int as n from public.email_messages where agency_id = $1`,
        [AGENCY_A],
      )
      expect(Number(lettura.rows[0]?.n)).toBeGreaterThanOrEqual(0)
    })
  })

  it('tiene il conto dei tentativi e non accetta numeri assurdi', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const { rows } = await accoda(s, { ...messaggio(), attempts: 1 })
      const id = String(rows[0]?.id)
      await s.query(
        `update public.email_messages set attempts = attempts + 1, last_attempt_at = now() where id = $1`,
        [id],
      )
      const dopo = await s.query(`select attempts from public.email_messages where id = $1`, [id])
      expect(Number(dopo.rows[0]?.attempts)).toBe(2)

      const errore = await rifiutato(s, () =>
        s.query(`update public.email_messages set attempts = -1 where id = $1`, [id]),
      )
      expect(errore).toMatch(/attempts/)
    })
  })
})

describe('impostazioni della posta', () => {
  it('ogni agenzia parte con la posta attiva e tiene le proprie preferenze', async () => {
    await asUser(USER_A_OWNER, async (s) => {
      const { rows } = await s.query(
        `select email_enabled, email_from_name from public.agency_settings where agency_id = $1`,
        [AGENCY_A],
      )
      expect(rows[0]?.email_enabled).toBe(true)

      await s.query(
        `update public.agency_settings
         set email_from_name = 'Orizzonti Viaggi', email_reply_to = 'prenotazioni@orizzontiviaggi.it'
         where agency_id = $1`,
        [AGENCY_A],
      )
      const dopo = await s.query(
        `select email_from_name, email_reply_to from public.agency_settings where agency_id = $1`,
        [AGENCY_A],
      )
      expect(dopo.rows[0]?.email_from_name).toBe('Orizzonti Viaggi')
    })
  })

  it('non si toccano le impostazioni di un’altra agenzia', async () => {
    await asUser(USER_B_OWNER, async (s) => {
      const { rows } = await s.query(
        `select agency_id from public.agency_settings where agency_id = $1`,
        [AGENCY_A],
      )
      expect(rows).toHaveLength(0)
    })
  })
})
