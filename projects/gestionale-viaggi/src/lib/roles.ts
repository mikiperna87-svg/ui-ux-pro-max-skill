import type { Enums } from '@/lib/database.types'

export type Role = Enums['user_role']

export const ROLES: readonly Role[] = ['titolare', 'amministrativo', 'operatore', 'sola_lettura']

export const ROLE_LABELS: Record<Role, string> = {
  titolare: 'Titolare',
  amministrativo: 'Amministrativo',
  operatore: 'Operatore',
  sola_lettura: 'Sola lettura',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  titolare: 'Accesso completo, incluse impostazioni, utenti e marginalità.',
  amministrativo: 'Pratiche, fatture, incassi e pagamenti. Nessuna impostazione.',
  operatore: 'Solo le proprie pratiche, i propri preventivi e i relativi clienti.',
  sola_lettura: 'Consultazione di tutta l’agenzia, nessuna modifica.',
}

/** Permessi derivati dal ruolo: unica fonte di verita lato applicazione. */
export const PERMISSIONS = {
  /** Modificare dati operativi (pratiche, clienti, preventivi, servizi). */
  write: (role: Role): boolean => role === 'titolare' || role === 'amministrativo' || role === 'operatore',
  /** Registrare incassi, pagamenti, emettere fatture. */
  accounting: (role: Role): boolean => role === 'titolare' || role === 'amministrativo',
  /** Impostazioni dell’agenzia, utenti, numerazioni. */
  settings: (role: Role): boolean => role === 'titolare',
  /** Vedere tutte le pratiche dell’agenzia e non solo le proprie. */
  allBookings: (role: Role): boolean => role !== 'operatore',
} as const

/**
 * I margini sono sempre visibili al titolare. Per gli altri ruoli dipende dal
 * parametro dell’agenzia: un operatore può non dover vedere quanto si guadagna.
 */
export function canSeeMargins(role: Role, hideFromOperators: boolean): boolean {
  if (role === 'titolare' || role === 'amministrativo') return true
  return !hideFromOperators
}
