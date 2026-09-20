import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getInvoiceDetail } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'
import { documentoFattura } from './documento-fattura'

// @react-pdf/renderer disegna il PDF con moduli Node (font, buffer): la rotta
// deve girare sul runtime Node, non sull'edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * La fattura in PDF: intestazione dell'agenzia, dati del cliente, righe e il
 * riepilogo per aliquota. Una bozza non si scarica, perché non ha un numero e
 * un documento senza numero non è una fattura.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  if (!UUID.test(id)) {
    return new Response('Documento non valido.', { status: 400 })
  }

  const detail = await getInvoiceDetail(id)
  if (!detail) {
    return new Response('Documento non trovato.', { status: 404 })
  }
  if (detail.invoice.status === 'bozza') {
    return new Response(
      'La bozza non ha ancora un numero: emetti il documento prima di scaricarlo.',
      { status: 409 },
    )
  }

  const supabase = await createClient()
  const [{ data: agency }, { data: customer }] = await Promise.all([
    supabase.from('agencies').select('*').eq('id', session.agency.id).single(),
    supabase.from('customers').select('*').eq('id', detail.invoice.customer_id).single(),
  ])

  if (!agency || !customer) {
    return new Response('Dati dell’agenzia o del cliente non disponibili.', { status: 500 })
  }

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

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${detail.invoice.kind === 'nota_credito' ? 'nota-credito' : 'fattura'}-${(detail.invoice.code ?? '').replace('/', '-')}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
