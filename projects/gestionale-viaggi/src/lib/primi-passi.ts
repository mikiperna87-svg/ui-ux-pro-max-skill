/**
 * Il percorso del primo giorno di un'agenzia.
 *
 * Qui stanno i passi e la regola che decide se sono fatti; i conteggi arrivano
 * da fuori. È codice puro perché le regole sono la parte che vale la pena
 * provare — quali passi, in che ordine, quali facoltativi — e provarla non deve
 * richiedere un database.
 */

/** Un passo del percorso guidato, con lo stato ricavato dai dati che ci sono. */
export interface PassoIniziale {
  readonly chiave: string
  readonly titolo: string
  /** Perché conviene farlo, in una frase. */
  readonly motivo: string
  readonly href: string
  readonly azione: string
  readonly fatto: boolean
  /** Un passo facoltativo non impedisce di dire che il percorso è finito. */
  readonly facoltativo: boolean
}

export interface StatoPrimiPassi {
  readonly passi: readonly PassoIniziale[]
  readonly fatti: number
  readonly totale: number
  /** Vero quando tutti i passi necessari sono fatti. */
  readonly completo: boolean
  readonly nascosto: boolean
}


/** Quello che serve per sapere a che punto è un'agenzia. */
export interface ConteggiIniziali {
  /** Partita IVA, indirizzo, CAP, città e provincia: tutti presenti. */
  readonly datiFiscali: boolean
  readonly clienti: number
  readonly fornitori: number
  readonly pratiche: number
  readonly documenti: number
  readonly persone: number
  readonly nascosto: boolean
}

export function componiPrimiPassi(conteggi: ConteggiIniziali): StatoPrimiPassi {
  const passi: PassoIniziale[] = [
    {
      chiave: 'agenzia',
      titolo: 'Completa i dati dell’agenzia',
      motivo:
        'Partita IVA, sede e provincia finiscono su ogni fattura e su ogni preventivo: senza, il documento non si può emettere.',
      href: '/impostazioni',
      azione: 'Vai alle impostazioni',
      fatto: conteggi.datiFiscali,
      facoltativo: false,
    },
    {
      chiave: 'clienti',
      titolo: 'Porta i clienti',
      motivo:
        'Sono il primo pezzo del trasloco, e servono prima di tutto il resto: pratiche, preventivi e fatture li citano per nome.',
      href: '/clienti/importa',
      azione: 'Importa i clienti',
      fatto: conteggi.clienti > 0,
      facoltativo: false,
    },
    {
      chiave: 'fornitori',
      titolo: 'Porta i fornitori',
      motivo:
        'Condizioni di pagamento e commissione predefinita di ciascuno fanno il resto da sole: scadenze e margini si calcolano da lì.',
      href: '/fornitori/importa',
      azione: 'Importa i fornitori',
      fatto: conteggi.fornitori > 0,
      facoltativo: false,
    },
    {
      chiave: 'pratiche',
      titolo: 'Porta le pratiche aperte',
      motivo:
        'I viaggi che stai ancora seguendo: da qui nascono scadenze, incassi e partenze in agenda.',
      href: '/pratiche/importa',
      azione: 'Importa le pratiche',
      fatto: conteggi.pratiche > 0,
      facoltativo: false,
    },
    {
      chiave: 'documenti',
      titolo: 'Porta i documenti pregressi',
      motivo:
        'Le fatture già emesse, con il loro numero e la loro data: l’estratto conto del cliente e il registro IVA tornano completi.',
      href: '/fatture/importa',
      azione: 'Importa i documenti',
      fatto: conteggi.documenti > 0,
      facoltativo: true,
    },
    {
      chiave: 'persone',
      titolo: 'Invita chi lavora con te',
      motivo:
        'Ognuno con il suo ruolo: chi vende non deve vedere la contabilità, e chi tiene i conti non deve chiedere a te.',
      href: '/impostazioni',
      azione: 'Aggiungi le persone',
      // Il titolare c'è già: la sua iscrizione è la prima, e da sola non conta.
      fatto: conteggi.persone > 1,
      facoltativo: true,
    },
  ]

  return {
    passi,
    fatti: passi.filter((passo) => passo.fatto).length,
    totale: passi.length,
    completo: passi.every((passo) => passo.fatto || passo.facoltativo),
    nascosto: conteggi.nascosto,
  }
}
