import { toCsv } from '@/lib/csv'
import { CUSTOMER_IMPORT_FIELDS } from '@/lib/import-maps'
import { requireSession } from '@/server/session'

/** Modello vuoto con le intestazioni riconosciute dall'importazione. */
export async function GET() {
  await requireSession()

  const example = {
    Tipo: 'Privato',
    Cognome: 'Rossi',
    Nome: 'Mario',
    'Ragione sociale': '',
    'Partita IVA': '',
    'Codice fiscale': 'RSSMRA85T10A562S',
    Email: 'mario.rossi@example.it',
    Telefono: '0332 123456',
    Cellulare: '335 1234567',
    Indirizzo: 'Via Roma 1',
    CAP: '21100',
    Città: 'Varese',
    Provincia: 'VA',
    'Data di nascita': '10/12/1985',
    'Luogo di nascita': 'Varese',
    Tag: 'vip, famiglia',
    Note: '',
    'Consenso privacy': 'Sì',
    'Consenso marketing': 'No',
  }

  const csv = toCsv(
    [example],
    CUSTOMER_IMPORT_FIELDS.map((field) => ({
      header: field.label,
      value: () => example[field.label as keyof typeof example] ?? '',
    })),
  )

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="modello-clienti.csv"',
      'cache-control': 'no-store',
    },
  })
}
