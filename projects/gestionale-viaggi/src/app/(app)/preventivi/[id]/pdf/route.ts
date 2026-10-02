import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getQuoteDetail } from '@/server/queries/preventivi'
import { requireSession } from '@/server/session'
import { documentoPreventivo } from './documento-preventivo'

// @react-pdf/renderer disegna il PDF con moduli Node (font, buffer): la rotta
// deve girare sul runtime Node, non sull'edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Il preventivo in PDF, con l'intestazione dell'agenzia e le proposte a
 * confronto. È il documento che si allega all'email: contiene i prezzi, mai i
 * costi né il margine, esattamente come la pagina pubblica.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params

  if (!UUID.test(id)) {
    return new Response('Preventivo non valido.', { status: 400 })
  }

  const detail = await getQuoteDetail(id)
  if (!detail) {
    return new Response('Preventivo non trovato.', { status: 404 })
  }

  const supabase = await createClient()
  const { data: agency } = await supabase
    .from('agencies')
    .select('*')
    .eq('id', session.agency.id)
    .single()

  if (!agency) {
    return new Response('Dati dell’agenzia non disponibili.', { status: 500 })
  }

  const buffer = await renderToBuffer(
    documentoPreventivo({
      quote: detail.quote,
      customerName: detail.summary?.customer_name ?? null,
      agency,
      items: detail.items,
      totals: detail.totals,
    }),
  )

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      // inline: si apre nel visualizzatore del browser, da cui si salva o si
      // stampa. Forzare il download toglierebbe l'anteprima senza dare nulla.
      'content-disposition': `inline; filename="preventivo-${detail.quote.code}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
