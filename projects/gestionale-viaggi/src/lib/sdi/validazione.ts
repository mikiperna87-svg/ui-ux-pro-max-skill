import { isValidVatNumber } from '@/lib/fiscal'
import { etichettaNatura, etichettaRegime } from '@/lib/sdi/codici'
import { naturaEffettiva, type RigaFattura } from '@/lib/sdi/riepilogo'

/**
 * I controlli che SdI farebbe, fatti prima.
 *
 * Uno scarto arriva giorni dopo, con un codice tipo «00423» e nessun
 * riferimento a che cosa correggere. Qui si dice la stessa cosa in italiano,
 * subito, e si dice anche dove andare a sistemarla: e' la differenza fra un
 * problema di cinque minuti e uno di mezza giornata.
 */

export type Gravita = 'blocco' | 'avviso'

export interface Rilievo {
  readonly gravita: Gravita
  readonly messaggio: string
  /** Dove si corregge, in parole: «Impostazioni → Agenzia». */
  readonly dove: string
}

export interface SoggettoDaVerificare {
  readonly denominazione?: string | null
  readonly nome?: string | null
  readonly cognome?: string | null
  readonly partitaIva?: string | null
  readonly codiceFiscale?: string | null
  readonly indirizzo?: string | null
  readonly cap?: string | null
  readonly comune?: string | null
  readonly provincia?: string | null
  readonly nazione?: string | null
}

export interface FatturaDaVerificare {
  readonly tipo: 'TD01' | 'TD04'
  readonly numero: string
  readonly data: string
  readonly righe: readonly RigaFattura[]
  readonly documentoRettificato?: { readonly numero: string; readonly data: string } | null
  readonly codiceDestinatario?: string | null
  readonly pecDestinatario?: string | null
  readonly bolloCentesimi: number
}

export interface AgenziaDaVerificare extends SoggettoDaVerificare {
  readonly regimeFiscale?: string | null
  readonly reaNumero?: string | null
  readonly reaUfficio?: string | null
}

const CAP = /^\d{5}$/
const PROVINCIA = /^[A-Z]{2}$/
const CODICE_DESTINATARIO = /^[A-Z0-9]{6,7}$/

function verificaSede(
  s: SoggettoDaVerificare,
  chi: string,
  dove: string,
  rilievi: Rilievo[],
): void {
  const italiana = (s.nazione ?? 'IT').toUpperCase() === 'IT'
  if (!s.indirizzo?.trim()) {
    rilievi.push({ gravita: 'blocco', messaggio: `Manca l’indirizzo ${chi}.`, dove })
  }
  if (!s.comune?.trim()) {
    rilievi.push({ gravita: 'blocco', messaggio: `Manca il comune ${chi}.`, dove })
  }
  if (italiana) {
    if (!s.cap || !CAP.test(s.cap)) {
      rilievi.push({
        gravita: 'blocco',
        messaggio: `Il CAP ${chi} deve essere di cinque cifre.`,
        dove,
      })
    }
    if (!s.provincia || !PROVINCIA.test(s.provincia.toUpperCase())) {
      rilievi.push({
        gravita: 'blocco',
        messaggio: `La provincia ${chi} deve essere la sigla di due lettere.`,
        dove,
      })
    }
  }
}

export function verificaAgenzia(a: AgenziaDaVerificare): readonly Rilievo[] {
  const dove = 'Impostazioni → Agenzia'
  const rilievi: Rilievo[] = []

  if (!a.denominazione?.trim()) {
    rilievi.push({ gravita: 'blocco', messaggio: 'Manca la denominazione dell’agenzia.', dove })
  }
  if (!a.partitaIva?.trim()) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'Manca la partita IVA dell’agenzia: senza, la fattura non si può trasmettere.',
      dove,
    })
  } else if (!isValidVatNumber(a.partitaIva)) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'La partita IVA dell’agenzia non supera la cifra di controllo.',
      dove,
    })
  }
  if (!a.regimeFiscale || !etichettaRegime(a.regimeFiscale)) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'Il regime fiscale non è impostato, o non è un codice riconosciuto.',
      dove,
    })
  }
  // Il blocco REA e' facoltativo, ma a meta' viene scartato.
  if (Boolean(a.reaNumero) !== Boolean(a.reaUfficio)) {
    rilievi.push({
      gravita: 'blocco',
      messaggio:
        'L’iscrizione REA va indicata per intero — ufficio e numero insieme — oppure lasciata vuota.',
      dove,
    })
  }
  verificaSede(a, 'dell’agenzia', dove, rilievi)
  return rilievi
}

export function verificaCliente(c: SoggettoDaVerificare): readonly Rilievo[] {
  const dove = 'Scheda del cliente'
  const rilievi: Rilievo[] = []

  if (!c.denominazione?.trim() && !(c.nome?.trim() && c.cognome?.trim())) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'Il cliente deve avere la ragione sociale, oppure nome e cognome.',
      dove,
    })
  }
  const italiano = (c.nazione ?? 'IT').toUpperCase() === 'IT'
  if (!c.partitaIva?.trim() && !c.codiceFiscale?.trim()) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: italiano
        ? 'Il cliente deve avere la partita IVA oppure il codice fiscale.'
        : 'Il cliente estero deve avere un identificativo fiscale.',
      dove,
    })
  }
  if (italiano && c.partitaIva?.trim() && !isValidVatNumber(c.partitaIva)) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'La partita IVA del cliente non supera la cifra di controllo.',
      dove,
    })
  }
  verificaSede(c, 'del cliente', dove, rilievi)
  return rilievi
}

export function verificaFattura(f: FatturaDaVerificare): readonly Rilievo[] {
  const dove = 'Scheda della fattura'
  const rilievi: Rilievo[] = []

  if (f.righe.length === 0) {
    rilievi.push({ gravita: 'blocco', messaggio: 'La fattura non ha righe.', dove })
  }

  f.righe.forEach((riga, indice) => {
    const n = indice + 1
    if (!riga.descrizione.trim()) {
      rilievi.push({ gravita: 'blocco', messaggio: `La riga ${n} non ha descrizione.`, dove })
    }
    if (riga.quantita <= 0) {
      rilievi.push({
        gravita: 'blocco',
        messaggio: `La riga ${n} ha quantità zero o negativa.`,
        dove,
      })
    }
    if (riga.regime !== 'ordinaria') {
      const natura = naturaEffettiva(riga)
      if (!natura) {
        rilievi.push({
          gravita: 'blocco',
          messaggio: `La riga ${n} non ha IVA e nemmeno una Natura: SdI la rifiuterebbe.`,
          dove,
        })
      } else if (!etichettaNatura(natura)) {
        rilievi.push({
          gravita: 'blocco',
          messaggio: `La riga ${n} indica la Natura «${natura}», che non è un codice riconosciuto.`,
          dove,
        })
      }
    }
  })

  if (f.tipo === 'TD04' && !f.documentoRettificato) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'Una nota di credito deve indicare la fattura che rettifica.',
      dove,
    })
  }

  const codice = f.codiceDestinatario?.trim().toUpperCase() ?? ''
  if (codice && codice !== '0000000' && !CODICE_DESTINATARIO.test(codice)) {
    rilievi.push({
      gravita: 'blocco',
      messaggio: 'Il codice destinatario deve avere sei o sette caratteri alfanumerici.',
      dove: 'Scheda del cliente',
    })
  }
  if ((!codice || codice === '0000000') && !f.pecDestinatario?.trim()) {
    rilievi.push({
      gravita: 'avviso',
      messaggio:
        'Il cliente non ha né codice destinatario né PEC: la fattura viene messa a disposizione nel suo cassetto fiscale, ma non gli arriva nulla. Per un privato va bene, per un’azienda quasi mai.',
      dove: 'Scheda del cliente',
    })
  }

  if (f.bolloCentesimi > 0 && f.bolloCentesimi !== 200) {
    rilievi.push({
      gravita: 'avviso',
      messaggio: 'Il bollo virtuale è normalmente di 2,00 €: controlla l’importo.',
      dove,
    })
  }

  return rilievi
}

export interface EsitoVerifica {
  readonly rilievi: readonly Rilievo[]
  readonly bloccanti: readonly Rilievo[]
  readonly trasmettibile: boolean
}

export function verificaTutto(
  agenzia: AgenziaDaVerificare,
  cliente: SoggettoDaVerificare,
  fattura: FatturaDaVerificare,
): EsitoVerifica {
  const rilievi = [
    ...verificaAgenzia(agenzia),
    ...verificaCliente(cliente),
    ...verificaFattura(fattura),
  ]
  const bloccanti = rilievi.filter((r) => r.gravita === 'blocco')
  return { rilievi, bloccanti, trasmettibile: bloccanti.length === 0 }
}
