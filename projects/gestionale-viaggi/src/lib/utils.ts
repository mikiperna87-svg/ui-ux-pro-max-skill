import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * Le dimensioni di testo del design system, dichiarate a tailwind-merge.
 *
 * Senza questa riga `cn('text-accent-fg', 'text-caption')` restituisce il solo
 * `text-caption`: tailwind-merge conosce le dimensioni predefinite di Tailwind
 * (`text-sm`, `text-lg`…), non le nostre, e di fronte a due classi `text-*`
 * che non riconosce le considera due colori in conflitto — così l'ultima
 * cancella la prima. È costato caro: ogni bottone con una dimensione (cioè
 * tutti, tranne quelli a sola icona) perdeva il colore del testo della propria
 * variante e finiva per ereditare quello del corpo della pagina. Il bottone
 * principale mostrava testo quasi nero su verde scuro — rapporto 2,7:1, sotto
 * la soglia AA di 4,5:1 — e in tema scuro l'inverso.
 */
const DIMENSIONI_TESTO = ['display', 'title', 'heading', 'body', 'small', 'caption'] as const

const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...DIMENSIONI_TESTO] }],
    },
  },
})

/** Unisce classi Tailwind risolvendo i conflitti (l’ultima vince). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}

/** Restituisce un valore non nullo o lancia: usato dove il tipo e' garantito dal DB. */
export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
  return value
}

/** Slug sicuro per nomi file e riferimenti visibili all’utente. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Iniziali per avatar: "Mario Rossi" -> "MR". */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}
