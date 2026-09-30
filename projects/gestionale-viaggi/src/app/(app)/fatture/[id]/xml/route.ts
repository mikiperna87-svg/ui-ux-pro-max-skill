import { xmlSdi } from '@/server/sdi/fattura'
import { requireSession } from '@/server/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Il file XML da consegnare all'intermediario.
 *
 * La rotta non cambia niente: il progressivo di invio lo assegna l'azione
 * «Prepara», una volta sola. Scaricare due volte deve dare lo stesso file,
 * perché è il nome del file a identificare la fattura presso SdI.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await params

  if (!UUID.test(id)) {
    return new Response('Documento non valido.', { status: 400 })
  }

  const esito = await xmlSdi(id)

  if (esito.esito === 'non_trovato') {
    return new Response('Documento non trovato.', { status: 404 })
  }
  if (esito.esito === 'bozza') {
    return new Response('La bozza non ha un numero: emetti il documento.', { status: 409 })
  }
  if (esito.esito === 'non_preparata') {
    return new Response('Il file non è ancora stato preparato.', { status: 409 })
  }
  if (esito.esito === 'dati_mancanti') {
    return new Response('Dati dell’agenzia o del cliente non disponibili.', { status: 500 })
  }
  if (esito.esito === 'non_valida') {
    const elenco = esito.verifica.bloccanti.map((r) => `· ${r.messaggio} (${r.dove})`).join('\n')
    return new Response(`Il documento non è pronto per la trasmissione:\n${elenco}`, {
      status: 409,
    })
  }

  return new Response(esito.xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'content-disposition': `attachment; filename="${esito.filename}"`,
      'cache-control': 'no-store',
    },
  })
}
