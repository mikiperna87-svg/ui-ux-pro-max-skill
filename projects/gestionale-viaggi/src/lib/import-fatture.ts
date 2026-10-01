import type { LegacyInvoiceImportInput } from '@/lib/validation/fatture'

/** Una voce del documento, nella forma che la funzione del database accetta. */
export interface VoceDocumento {
  readonly description: string
  readonly quantity: number
  readonly unit_price_cents: number
  readonly cost_cents: number
  readonly vat_bps: number
  readonly vat_regime: string
}

/** Un documento pregresso ricomposto dalle righe del file. */
export interface DocumentoPregresso {
  /** Righe del file da cui viene, per poter dire dove sta l'errore. */
  readonly lines: readonly number[]
  readonly cliente: string
  readonly kind: 'fattura' | 'nota_credito'
  readonly year: number
  readonly number: number
  readonly code: string | null
  readonly issue_date: string
  readonly due_date: string | null
  readonly status: 'emessa' | 'inviata' | 'pagata' | 'annullata'
  readonly vat_regime: string
  readonly notes: string | null
  readonly items: readonly VoceDocumento[]
}

export interface RigaDocumento {
  readonly line: number
  readonly dati: LegacyInvoiceImportInput
}

export interface Raggruppamento {
  readonly documenti: readonly DocumentoPregresso[]
  /** Righe scartate perché in conflitto con la prima riga dello stesso documento. */
  readonly conflitti: readonly { line: number; reason: string }[]
}

const chiaveDocumento = (dati: LegacyInvoiceImportInput): string =>
  `${dati.kind}|${dati.issue_date.slice(0, 4)}|${dati.number}`

/**
 * Ricompone i documenti dalle righe del file.
 *
 * Più righe con lo stesso tipo, anno e numero sono lo stesso documento: è la
 * forma in cui i gestionali esportano il registro delle vendite, una riga per
 * voce. La prima riga di un documento ne fissa la testata — cliente, date,
 * stato, regime — e le successive aggiungono solo voci.
 *
 * Quando una riga successiva contraddice la testata (un cliente diverso sulla
 * stessa fattura, un'altra data di emissione) viene scartata quella riga e non
 * il documento: importare una fattura con la riga di un altro cliente
 * attaccata sarebbe peggio, e nessuno se ne accorgerebbe.
 */
export function raggruppaDocumenti(righe: readonly RigaDocumento[]): Raggruppamento {
  const perChiave = new Map<
    string,
    { testata: DocumentoPregresso; lines: number[]; items: VoceDocumento[] }
  >()
  const conflitti: { line: number; reason: string }[] = []

  for (const { line, dati } of righe) {
    const chiave = chiaveDocumento(dati)
    const voce: VoceDocumento = {
      description: dati.description,
      quantity: dati.quantity,
      unit_price_cents: dati.importo ?? 0,
      cost_cents: dati.costo ?? 0,
      vat_bps: dati.vat_percent,
      vat_regime: dati.vat_regime,
    }

    const esistente = perChiave.get(chiave)
    if (!esistente) {
      perChiave.set(chiave, {
        testata: {
          lines: [line],
          cliente: dati.cliente,
          kind: dati.kind,
          year: Number(dati.issue_date.slice(0, 4)),
          number: dati.number,
          code: dati.code,
          issue_date: dati.issue_date,
          due_date: dati.due_date,
          status: dati.status,
          vat_regime: dati.vat_regime,
          notes: dati.notes,
          items: [],
        },
        lines: [line],
        items: [voce],
      })
      continue
    }

    const testata = esistente.testata
    if (dati.cliente.trim().toLowerCase() !== testata.cliente.trim().toLowerCase()) {
      conflitti.push({
        line,
        reason: `Il documento ${testata.number} è già intestato a «${testata.cliente}» alla riga ${testata.lines[0]}`,
      })
      continue
    }
    if (dati.issue_date !== testata.issue_date) {
      conflitti.push({
        line,
        reason: `Il documento ${testata.number} è datato ${testata.issue_date} alla riga ${testata.lines[0]}`,
      })
      continue
    }

    esistente.lines.push(line)
    esistente.items.push(voce)
  }

  const documenti = [...perChiave.values()].map((gruppo) => ({
    ...gruppo.testata,
    lines: gruppo.lines,
    items: gruppo.items,
  }))

  return { documenti, conflitti }
}
