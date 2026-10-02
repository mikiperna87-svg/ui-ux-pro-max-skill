import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * La firma di un webhook in arrivo.
 *
 * Un endpoint che aggiorna gli abbonamenti è, di fatto, un modo per regalare
 * mesi di servizio a chiunque ne conosca l'indirizzo. La firma è quello che
 * distingue il fornitore di pagamenti da chiunque altro.
 *
 * Lo schema è quello che usano quasi tutti i fornitori — intestazione
 * `t=<epoca>,v1=<hmac esadecimale>`, HMAC-SHA256 su `<epoca>.<corpo grezzo>` —
 * perché scriverne uno proprio significherebbe che chi collega il fornitore
 * debba adattarcisi, invece del contrario.
 */
export type EsitoFirma =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: string }

/** Quanto può essere vecchia una richiesta prima di non valere più. */
export const TOLLERANZA_SECONDI = 300

export function verificaFirma(
  corpo: string,
  intestazione: string | null,
  segreto: string,
  adesso: number = Math.floor(Date.now() / 1000),
): EsitoFirma {
  if (!segreto) return { valida: false, motivo: 'Nessun segreto configurato sul server' }
  if (!intestazione) return { valida: false, motivo: 'Firma assente' }

  const parti = new Map(
    intestazione
      .split(',')
      .map((pezzo) => pezzo.trim().split('='))
      .filter((coppia): coppia is [string, string] => coppia.length === 2)
      .map(([chiave, valore]) => [chiave, valore]),
  )

  const epoca = Number(parti.get('t'))
  const firma = parti.get('v1')
  if (!Number.isFinite(epoca) || !firma) {
    return { valida: false, motivo: 'Firma malformata' }
  }

  // Senza il controllo sull'orario, una richiesta firmata intercettata una
  // volta varrebbe per sempre.
  if (Math.abs(adesso - epoca) > TOLLERANZA_SECONDI) {
    return { valida: false, motivo: 'Richiesta troppo vecchia o con orario sbagliato' }
  }

  const atteso = createHmac('sha256', segreto).update(`${epoca}.${corpo}`).digest()
  let ricevuto: Buffer
  try {
    ricevuto = Buffer.from(firma, 'hex')
  } catch {
    return { valida: false, motivo: 'Firma non esadecimale' }
  }
  if (ricevuto.length !== atteso.length) {
    return { valida: false, motivo: 'Firma di lunghezza sbagliata' }
  }
  if (!timingSafeEqual(ricevuto, atteso)) {
    return { valida: false, motivo: 'Firma non corrispondente' }
  }
  return { valida: true }
}

/** La firma da mandare: serve ai test e a chi deve provare l'integrazione. */
export function firma(corpo: string, segreto: string, epoca: number): string {
  const hmac = createHmac('sha256', segreto).update(`${epoca}.${corpo}`).digest('hex')
  return `t=${epoca},v1=${hmac}`
}
