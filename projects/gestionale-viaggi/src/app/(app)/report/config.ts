import type { Periodo } from '@/lib/report-period'

export const VISTE = ['operatori', 'destinazioni', 'fornitori'] as const
export type Vista = (typeof VISTE)[number]

export const ETICHETTE_VISTA: Record<Vista, string> = {
  operatori: 'Operatori',
  destinazioni: 'Destinazioni',
  fornitori: 'Fornitori',
}

export const DESCRIZIONI_VISTA: Record<Vista, string> = {
  operatori: 'Quanto ha venduto ciascuno, con quale margine e quanto resta da incassare.',
  destinazioni: 'Dove vanno i clienti e quali mete rendono davvero.',
  fornitori: 'Quanto si compra da ognuno, quanto rende e quanto resta da pagargli.',
}

/** Oltre questa soglia l'elenco delle destinazioni si ferma e lo dichiara. */
export const LIMITE_DESTINAZIONI = 50

export function isVista(value: unknown): value is Vista {
  return typeof value === 'string' && (VISTE as readonly string[]).includes(value)
}

/**
 * La vista richiesta, se esiste ed è consentita.
 *
 * Il report dei fornitori è per intero una lettura di costi: mostrarlo a chi
 * non può vedere i margini equivarrebbe a mostrargli i margini, perché il
 * ricarico si ottiene per differenza. Chi non ne ha diritto torna agli
 * operatori invece di ricevere un errore.
 */
export function vistaDa(
  value: string | string[] | undefined,
  puoVedereMargini: boolean,
): Vista {
  const richiesta = Array.isArray(value) ? value[0] : value
  if (!isVista(richiesta)) return 'operatori'
  if (richiesta === 'fornitori' && !puoVedereMargini) return 'operatori'
  return richiesta
}

export function visteVisibili(puoVedereMargini: boolean): readonly Vista[] {
  return puoVedereMargini ? VISTE : VISTE.filter((vista) => vista !== 'fornitori')
}

/**
 * L'indirizzo di una vista mantenendo il periodo scelto.
 *
 * Un preset resta un preset — così il collegamento continua a dire "anno
 * corrente" anche fra tre mesi — mentre un periodo scritto a mano viaggia con
 * le sue due date.
 */
export function linkVista(vista: Vista, periodo: Periodo): string {
  const query =
    periodo.chiave === 'personalizzato'
      ? `da=${periodo.from}&a=${periodo.to}`
      : `periodo=${periodo.chiave}`
  return `/report?vista=${vista}&${query}`
}

/** L'indirizzo dell'esportazione: il periodo viaggia sempre risolto in due date. */
export function linkEsporta(vista: Vista, periodo: Periodo): string {
  return `/report/esporta?vista=${vista}&da=${periodo.from}&a=${periodo.to}`
}
