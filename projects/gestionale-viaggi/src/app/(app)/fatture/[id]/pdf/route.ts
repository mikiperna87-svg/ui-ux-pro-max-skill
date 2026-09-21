import { pdfFattura } from '@/server/pdf/fattura'
import { requireSession } from '@/server/session'

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
  await requireSession()
  const { id } = await params

  if (!UUID.test(id)) {
    return new Response('Documento non valido.', { status: 400 })
  }

  const esito = await pdfFattura(id)

  if (esito.esito === 'non_trovato') {
    return new Response('Documento non trovato.', { status: 404 })
  }
  if (esito.esito === 'bozza') {
    return new Response(
      'La bozza non ha ancora un numero: emetti il documento prima di scaricarlo.',
      { status: 409 },
    )
  }
  if (esito.esito === 'dati_mancanti') {
    return new Response('Dati dell’agenzia o del cliente non disponibili.', { status: 500 })
  }

  return new Response(new Uint8Array(esito.pdf.buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${esito.pdf.filename}"`,
      'cache-control': 'no-store',
    },
  })
}
