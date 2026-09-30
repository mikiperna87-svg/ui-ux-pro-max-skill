import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Il codice che serve per aprire una nuova agenzia, o null se non ne serve uno.
 *
 * Senza la variabile, il modulo resta aperto: e' quello che vuole chi sviluppa
 * in locale e chi installa il gestionale per la prima volta. Con la variabile,
 * la registrazione e' di fatto chiusa a chi passa di li' per caso, ma non a chi
 * il codice ce l'ha — a differenza dell'interruttore «disable signup» di
 * Supabase, che chiude fuori anche il proprietario.
 *
 * La variabile non ha il prefisso NEXT_PUBLIC: resta sul server e non finisce
 * nel pacchetto che arriva al browser.
 */
export function codiceRegistrazione(): string | null {
  const valore = process.env.CODICE_REGISTRAZIONE?.trim()
  return valore ? valore : null
}

/**
 * Confronto a tempo costante fra il codice atteso e quello ricevuto.
 *
 * Il tempo di risposta non deve dire quante lettere iniziali erano giuste: un
 * `===` esce al primo carattere diverso, e su abbastanza tentativi la
 * differenza si misura. I due valori passano prima da uno sha256 perche'
 * `timingSafeEqual` pretende buffer della stessa lunghezza, e la lunghezza del
 * codice e' essa stessa un'informazione da non regalare.
 */
export function codiceCorretto(atteso: string, fornito: string): boolean {
  const a = createHash('sha256').update(atteso, 'utf8').digest()
  const b = createHash('sha256').update(fornito, 'utf8').digest()
  return timingSafeEqual(a, b)
}
