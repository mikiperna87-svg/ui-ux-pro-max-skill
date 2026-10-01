import { componiPrimiPassi, type StatoPrimiPassi } from '@/lib/primi-passi'
import { createClient } from '@/lib/supabase/server'
import { requireSession } from '@/server/session'

export type { PassoIniziale, StatoPrimiPassi } from '@/lib/primi-passi'

/**
 * Lo stato dei primi passi dell'agenzia di chi guarda.
 *
 * Niente è memorizzato: ogni passo si verifica contando i dati che ci sono. Un
 * elenco di passi «completati» salvato a parte divergerebbe dalla realtà al
 * primo cliente cancellato, e mostrerebbe spuntato un passo che non lo è.
 *
 * I conteggi passano dalla RLS come tutto il resto, quindi contano solo i dati
 * dell'agenzia. Vengono chiesti con `head: true`: serve il numero, non le righe.
 */
export async function statoPrimiPassi(): Promise<StatoPrimiPassi> {
  const session = await requireSession()
  const supabase = await createClient()

  const conta = (tabella: 'customers' | 'suppliers' | 'bookings' | 'invoices' | 'memberships') =>
    supabase.from(tabella).select('id', { count: 'exact', head: true }).is('deleted_at', null)

  const [clienti, fornitori, pratiche, documenti, persone] = await Promise.all([
    conta('customers'),
    conta('suppliers'),
    conta('bookings'),
    conta('invoices'),
    conta('memberships'),
  ])

  const agenzia = session.agency
  // I dati che servono per emettere una fattura: senza uno di questi il
  // documento non si può nemmeno numerare, e l'agenzia lo scopre il giorno in
  // cui deve fatturare.
  const pieno = (valore: string | null) => (valore ?? '').trim() !== ''

  return componiPrimiPassi({
    datiFiscali:
      pieno(agenzia.vat_number) &&
      pieno(agenzia.address_line) &&
      pieno(agenzia.postal_code) &&
      pieno(agenzia.city) &&
      pieno(agenzia.province),
    clienti: clienti.count ?? 0,
    fornitori: fornitori.count ?? 0,
    pratiche: pratiche.count ?? 0,
    documenti: documenti.count ?? 0,
    persone: persone.count ?? 0,
    nascosto: session.settings.onboarding_dismissed_at !== null,
  })
}
