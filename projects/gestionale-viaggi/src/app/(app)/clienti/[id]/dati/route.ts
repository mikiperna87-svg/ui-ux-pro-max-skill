import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'
import { requireSession } from '@/server/session'

/**
 * Esportazione dei dati di un cliente per il diritto di accesso (GDPR art. 15).
 * Il file contiene anagrafica, passeggeri, pratiche, incassi e fatture.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await requireSession()
  const { id } = await context.params
  const supabase = await createClient()

  const [{ data: payload, error }, { data: customer }] = await Promise.all([
    supabase.rpc('export_customer_data', { p_customer_id: id }),
    supabase.from('customers').select('display_name').eq('id', id).maybeSingle(),
  ])

  if (error || !payload) {
    return new Response(JSON.stringify({ errore: 'Cliente non trovato o non accessibile.' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  }

  const name = slugify(customer?.display_name ?? 'cliente')
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="dati-${name}.json"`,
      'cache-control': 'no-store',
    },
  })
}
