import { toCsv } from '@/lib/csv'
import { PASSENGER_IMPORT_FIELDS } from '@/lib/import-maps'
import { requireSession } from '@/server/session'

export async function GET() {
  await requireSession()

  const example: Record<string, string> = {
    Cognome: 'Verdi',
    Nome: 'Anna',
    'Data di nascita': '22/05/1990',
    'Luogo di nascita': 'Milano',
    Sesso: 'F',
    Nazionalità: 'IT',
    'Codice fiscale': '',
    Email: 'anna.verdi@example.it',
    Telefono: '335 7654321',
    'Tipo documento': 'Passaporto',
    'Numero documento': 'YA1234567',
    Rilascio: '01/03/2020',
    Scadenza: '01/03/2030',
    'Rilasciato da': 'Questura di Milano',
    'Esigenze alimentari': 'Intollerante al lattosio',
    'Esigenze particolari': '',
    Note: '',
  }

  const csv = toCsv(
    [example],
    PASSENGER_IMPORT_FIELDS.map((field) => ({
      header: field.label,
      value: () => example[field.label] ?? '',
    })),
  )

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="modello-passeggeri.csv"',
      'cache-control': 'no-store',
    },
  })
}
