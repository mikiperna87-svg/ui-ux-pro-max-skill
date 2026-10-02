import { IMPORT_DEFINITIONS, templateCsv } from '@/lib/import-registry'
import { requireSession } from '@/server/session'

/** Modello con le intestazioni riconosciute dall'importazione e righe di esempio. */
export async function GET() {
  await requireSession()

  return new Response(templateCsv('fornitori'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${IMPORT_DEFINITIONS.fornitori.templateFile}"`,
      'cache-control': 'no-store',
    },
  })
}
