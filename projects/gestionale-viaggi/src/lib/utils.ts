import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Unisce classi Tailwind risolvendo i conflitti (l’ultima vince). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
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
