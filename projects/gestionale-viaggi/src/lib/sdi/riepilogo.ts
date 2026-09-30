import { naturaDaRegime, normaDaRegime, type RegimeIva } from '@/lib/sdi/codici'
import type { RiepilogoTracciato, RigaTracciato } from '@/lib/sdi/tracciato'

/**
 * Una riga di fattura come la tiene il gestionale.
 *
 * `prezzoUnitarioCentesimi` è **IVA inclusa**: è la convenzione di tutto il
 * gestionale, la stessa che usano `app.line_vat_cents` e `app.line_taxable_cents`
 * sul database. L'IVA si scorpora dal prezzo, non si aggiunge sopra — e chi
 * scrive un cliente al banco dice «ottocento euro», non «ottocento più IVA».
 */
export interface RigaFattura {
  readonly descrizione: string
  readonly quantita: number
  readonly prezzoUnitarioCentesimi: number
  readonly regime: RegimeIva
  readonly aliquotaBps: number
  /** Deroga sulla Natura: null vuol dire «quella che discende dal regime». */
  readonly naturaScavalcata?: string | null
}

/** Il corrispettivo della riga, IVA inclusa. */
export function lordoRiga(riga: RigaFattura): number {
  return riga.quantita * riga.prezzoUnitarioCentesimi
}

/**
 * L'IVA contenuta nel corrispettivo.
 *
 * Stessa formula del database — `lordo - round(lordo * 10000 / (10000 + bps))`
 * — perché il file XML e la fattura che il cliente ha in mano devono dire lo
 * stesso numero. Una formula scritta due volte in due posti è una divergenza
 * in attesa di succedere, e qui la divergenza sarebbe fra un documento
 * fiscale e la sua copia telematica.
 */
export function ivaRiga(riga: RigaFattura): number {
  if (riga.regime !== 'ordinaria' || riga.aliquotaBps === 0) return 0
  const lordo = lordoRiga(riga)
  return lordo - Math.round((lordo * 10_000) / (10_000 + riga.aliquotaBps))
}

/**
 * L'imponibile che finisce nel tracciato: il corrispettivo meno l'IVA che
 * contiene.
 *
 * Fuori dal regime ordinario l'imponibile è il corrispettivo intero. Nel
 * 74-ter questo può sorprendere, perché l'imponibile *dell'agenzia* è il
 * margine: ma quello riguarda i registri IVA dell'agenzia, non la fattura al
 * cliente, dove l'IVA non è esposta e l'importo dichiarato è quello pagato.
 */
export function imponibileRiga(riga: RigaFattura): number {
  return lordoRiga(riga) - ivaRiga(riga)
}

/** L'aliquota che finisce nel tracciato: fuori dal regime ordinario è zero. */
export function aliquotaEffettiva(riga: RigaFattura): number {
  return riga.regime === 'ordinaria' ? riga.aliquotaBps : 0
}

/** La Natura che finisce nel tracciato: la deroga se c'è, altrimenti quella del regime. */
export function naturaEffettiva(riga: RigaFattura): string | null {
  return riga.naturaScavalcata ?? naturaDaRegime(riga.regime)
}

export function righeTracciato(righe: readonly RigaFattura[]): readonly RigaTracciato[] {
  return righe.map((riga, indice) => ({
    numero: indice + 1,
    descrizione: riga.descrizione,
    quantita: riga.quantita,
    prezzoTotaleCentesimi: imponibileRiga(riga),
    aliquotaBps: aliquotaEffettiva(riga),
    natura: naturaEffettiva(riga),
  }))
}

/**
 * I riepiloghi per aliquota e natura.
 *
 * SdI pretende un riepilogo per ogni combinazione distinta di aliquota e
 * natura. Imponibile e imposta si sommano riga per riga, com'è sul database:
 * così la somma dei riepiloghi torna al centesimo con il totale della fattura
 * che il cliente ha ricevuto. Ricalcolarla sul gruppo darebbe un numero più
 * "pulito" e un documento che contraddice il suo originale.
 */
export function riepiloghiDaRighe(righe: readonly RigaFattura[]): readonly RiepilogoTracciato[] {
  const gruppi = new Map<
    string,
    { aliquotaBps: number; natura: string | null; imponibile: number; imposta: number; norma: string | null }
  >()

  for (const riga of righe) {
    const aliquota = aliquotaEffettiva(riga)
    const natura = naturaEffettiva(riga)
    const chiave = `${aliquota}|${natura ?? ''}`
    const esistente = gruppi.get(chiave)
    if (esistente) {
      esistente.imponibile += imponibileRiga(riga)
      esistente.imposta += ivaRiga(riga)
    } else {
      gruppi.set(chiave, {
        aliquotaBps: aliquota,
        natura,
        imponibile: imponibileRiga(riga),
        imposta: ivaRiga(riga),
        norma: normaDaRegime(riga.regime),
      })
    }
  }

  return [...gruppi.values()]
    .sort((a, b) => b.aliquotaBps - a.aliquotaBps || (a.natura ?? '').localeCompare(b.natura ?? ''))
    .map((g) => ({
      aliquotaBps: g.aliquotaBps,
      natura: g.natura,
      imponibileCentesimi: g.imponibile,
      impostaCentesimi: g.imposta,
      riferimentoNormativo: g.norma,
    }))
}

/** Il totale del documento: imponibili più imposte, più l'eventuale bollo. */
export function totaleDocumento(
  riepiloghi: readonly RiepilogoTracciato[],
  bolloCentesimi = 0,
): number {
  return (
    riepiloghi.reduce((somma, r) => somma + r.imponibileCentesimi + r.impostaCentesimi, 0) +
    bolloCentesimi
  )
}
