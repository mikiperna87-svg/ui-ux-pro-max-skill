import { Building2, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'
import type { Role } from '@/lib/roles'

export interface NavItem {
  readonly href: string
  readonly label: string
  readonly icon: LucideIcon
  readonly description: string
  /** Ruoli ammessi; assente = tutti. */
  readonly roles?: readonly Role[]
}

/**
 * Voci di navigazione. Contiene solo le sezioni realmente implementate:
 * una voce che porta a una pagina inesistente e' peggio di una vocè assente.
 * Le sezioni successive (pratiche, preventivi, clienti, fornitori,
 * amministrazione, agenda) si aggiungono qui quando il modulo viene consegnato.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: 'Panoramica',
    icon: LayoutDashboard,
    description: 'Indicatori dell’agenzia e attività recenti',
  },
  {
    href: '/impostazioni',
    label: 'Impostazioni',
    icon: Settings,
    description: 'Dati agenzia, utenti e parametri operativi',
    roles: ['titolare'],
  },
]

export const SECONDARY_NAV: readonly NavItem[] = [
  {
    href: '/impostazioni/agenzia',
    label: 'Dati agenzia',
    icon: Building2,
    description: 'Ragione sociale, partita IVA, contatti',
    roles: ['titolare'],
  },
]

export function visibleNavItems(items: readonly NavItem[], role: Role): readonly NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role))
}
