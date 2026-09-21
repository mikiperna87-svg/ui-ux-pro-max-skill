import 'server-only'

import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceDetail } from '@/server/queries/fatture'
import { documentoFattura } from '@/server/pdf/documento-fattura'

/**
 * Il PDF di un documento, costruito una volta sola per chi lo chiede.
 *
 * Lo stesso file serve a due strade diverse — il pulsante "Scarica" e
 * l'allegato dell'email — e una seconda copia del codice avrebbe voluto dire
 * due fatture diverse per lo stesso numero il giorno in cui una sola delle
 * due venisse aggiornata.
 */
export interface PdfDocumento {
  readonly buffer: Buffer
  readonly filename: string
}

export type EsitoPdf =
  | { readonly esito: 'ok'; readonly pdf: PdfDocumento }
  | { readonly esito: 'non_trovato' }
  | { readonly esito: 'bozza' }
  | { readonly esito: 'dati_mancanti' }

export async function pdfFattura(invoiceId: string): Promise<EsitoPdf> {
  const detail = await getInvoiceDetail(invoiceId)
  if (!detail) return { esito: 'non_trovato' }
  // Una bozza non ha numero, e un documento senza numero non è una fattura.
  if (detail.invoice.status === 'bozza') return { esito: 'bozza' }

  const supabase = await createClient()
  const [{ data: agency }, { data: customer }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', detail.invoice.agency_id).single(),
    supabase.from('customers').select('*').eq('id', detail.invoice.customer_id).single(),
  ])

  if (!agency || !customer) return { esito: 'dati_mancanti' }

  const buffer = await renderToBuffer(
    documentoFattura({
      invoice: detail.invoice,
      customer,
      agency,
      items: detail.items,
      bookingCode: detail.summary?.booking_code ?? null,
      creditNoteOfCode: detail.summary?.credit_note_of_code ?? null,
    }),
  )

  return {
    esito: 'ok',
    pdf: {
      buffer,
      filename: nomeFile(detail.invoice.kind, detail.invoice.code),
    },
  }
}

/** "fattura-2026-0007.pdf": niente barre, che in un nome di file non stanno. */
export function nomeFile(kind: 'fattura' | 'nota_credito', code: string | null): string {
  const prefisso = kind === 'nota_credito' ? 'nota-credito' : 'fattura'
  return `${prefisso}-${(code ?? 'documento').replace(/\//g, '-')}.pdf`
}
