import {
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  FileText,
  Luggage,
  Receipt,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/roles'

export interface NavItem {
  readonly href: string
  readonly label: string
  readonly icon: LucideIcon
  readonly description: string
  /** Ruoli ammessi; assente = tutti. */
  readonly roles?: readonly Role[]
  /**
   * Lettera da premere dopo "G" per raggiungere la sezione. Sta qui e non nel
   * pannello delle scorciatoie perché l'elenco mostrato all'utente e i tasti
   * che funzionano davvero devono essere la stessa cosa.
   */
  readonly shortcut?: string
}

/**
 * Voci di navigazione. Contiene solo le sezioni realmente implementate: una
 * voce che porta a una pagina inesistente è peggio di una voce assente — ed è
 * il motivo per cui l'elenco secondario, che nessuna barra rendeva e che
 * puntava a una pagina mai scritta, è stato tolto invece che completato.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/',
    label: 'Panoramica',
    shortcut: 'p',
    icon: LayoutDashboard,
    description: 'Indicatori dell’agenzia e attività recenti',
  },
  {
    href: '/pratiche',
    label: 'Pratiche',
    shortcut: 'r',
    icon: Luggage,
    description: 'Viaggi venduti, scadenze, incassi e margine',
  },
  {
    href: '/preventivi',
    label: 'Preventivi',
    shortcut: 'v',
    icon: FileText,
    description: 'Proposte inviate ai clienti e risposte ricevute',
  },
  {
    href: '/scadenzario',
    label: 'Scadenzario',
    shortcut: 'd',
    icon: CalendarClock,
    description: 'Incassi da ricevere e pagamenti ai fornitori',
  },
  {
    href: '/agenda',
    label: 'Agenda',
    shortcut: 'e',
    icon: CalendarCheck,
    description: 'Attività da fare, scadenze e partenze del giorno',
  },
  {
    href: '/fatture',
    label: 'Fatture',
    shortcut: 'a',
    icon: Receipt,
    description: 'Fatture, note di credito e regime 74-ter',
    roles: ['titolare', 'amministrativo', 'sola_lettura'],
  },
  {
    href: '/report',
    label: 'Report',
    shortcut: 'o',
    icon: ChartColumn,
    description: 'Rendimento per operatore, destinazione e fornitore',
  },
  {
    href: '/clienti',
    label: 'Clienti',
    shortcut: 'c',
    icon: Users,
    description: 'Anagrafica, storico viaggi e consensi',
  },
  {
    href: '/passeggeri',
    label: 'Passeggeri',
    shortcut: 's',
    icon: UsersRound,
    description: 'Documenti, scadenze ed esigenze particolari',
  },
  {
    href: '/fornitori',
    label: 'Fornitori',
    shortcut: 'f',
    icon: Truck,
    description: 'Condizioni, scadenzario e marginalità',
  },
  {
    href: '/impostazioni',
    label: 'Impostazioni',
    shortcut: 'i',
    icon: Settings,
    description: 'Dati agenzia, utenti e parametri operativi',
    roles: ['titolare'],
  },
]

export function visibleNavItems(items: readonly NavItem[], role: Role): readonly NavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role))
}
