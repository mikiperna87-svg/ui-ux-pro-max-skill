import { toCsv } from '@/lib/csv'
import { SUPPLIER_IMPORT_FIELDS } from '@/lib/import-maps'
import { requireSession } from '@/server/session'

export async function GET() {
  await requireSession()

  const example: Record<string, string> = {
    Nome: 'Mediterranea Tour',
    Tipo: 'Tour operator',
    'Ragione sociale': 'Mediterranea Tour S.p.A.',
    'Partita IVA': '02114560150',
    'Codice fiscale': '',
    Email: 'booking@mediterraneatour.it',
    PEC: '',
    Telefono: '02 4455 1100',
    Referente: 'Elena Colombo',
    Indirizzo: 'Via Torino 12',
    CAP: '20123',
    Città: 'Milano',
    Provincia: 'MI',
    IBAN: 'IT12A0300203280000400551122',
    'Giorni di pagamento': '30',
    'Commissione %': '12',
    'Regime IVA': 'Margine',
    Note: '',
    Attivo: 'Sì',
  }

  const csv = toCsv(
    [example],
    SUPPLIER_IMPORT_FIELDS.map((field) => ({
      header: field.label,
      value: () => example[field.label] ?? '',
    })),
  )

  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="modello-fornitori.csv"',
      'cache-control': 'no-store',
    },
  })
}
