import { isTipoAgenda, type TipoAgenda } from '@/server/queries/agenda'

export const FINESTRE = [
  { key: 'oggi', label: 'Oggi', giorni: 0 },
  { key: 'settimana', label: '7 giorni', giorni: 7 },
  { key: 'mese', label: '30 giorni', giorni: 30 },
] as const

export type ChiaveFinestra = (typeof FINESTRE)[number]['key']

/**
 * Quanto passato guardare all'indietro.
 *
 * Una scadenza saltata non smette di esistere il giorno dopo: l'agenda parte
 * sempre due mesi prima, così ciò che è in ritardo resta sotto gli occhi
 * invece di scomparire dal calendario.
 */
export const GIORNI_INDIETRO = 60

export function finestraDa(value: string | string[] | undefined) {
  const chiave = Array.isArray(value) ? value[0] : value
  return FINESTRE.find((finestra) => finestra.key === chiave) ?? FINESTRE[1]
}

export const ETICHETTE_TIPO: Record<TipoAgenda, string> = {
  attivita: 'Attività',
  incasso: 'Incassi',
  pagamento: 'Pagamenti',
  partenza: 'Partenze',
  documento: 'Documenti',
}

export function tipoDa(value: string | string[] | undefined): TipoAgenda | null {
  const richiesto = Array.isArray(value) ? value[0] : value
  return isTipoAgenda(richiesto) ? richiesto : null
}

export interface StatoAgenda {
  readonly finestra: ChiaveFinestra
  readonly tipo: TipoAgenda | null
  readonly soloMie: boolean
}

/** L'indirizzo dell'agenda con un filtro cambiato e gli altri al loro posto. */
export function linkAgenda(stato: StatoAgenda, modifica: Partial<StatoAgenda>): string {
  const finale = { ...stato, ...modifica }
  const parti = [`finestra=${finale.finestra}`]
  if (finale.tipo) parti.push(`tipo=${finale.tipo}`)
  if (finale.soloMie) parti.push('chi=mie')
  return `/agenda?${parti.join('&')}`
}
