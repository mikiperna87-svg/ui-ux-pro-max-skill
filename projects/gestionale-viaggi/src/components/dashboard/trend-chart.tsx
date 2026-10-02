import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { toRome } from '@/lib/date'
import { formatEuro, formatPercent, ratioBps } from '@/lib/money'
import type { MonthlyPoint } from '@/server/queries/dashboard'

/**
 * Andamento mensile: la barra chiara è il venduto, la porzione piena in basso
 * è il margine. Disegnato in SVG-less CSS perché dodici barre non giustificano
 * il peso di una libreria di grafici.
 *
 * Sotto al grafico c'è la stessa informazione in tabella, riservata ai lettori
 * di schermo: il colore non è mai l'unico modo di leggere il dato.
 */
export function TrendChart({ points }: { points: readonly MonthlyPoint[] }) {
  const max = Math.max(...points.map((point) => point.revenueCents), 1)

  return (
    <figure className="space-y-3">
      <div className="flex h-40 items-stretch gap-1 sm:gap-1.5">
        {points.map((point) => {
          const revenueHeight = point.revenueCents > 0 ? Math.max((point.revenueCents / max) * 100, 3) : 1.5
          // La parte scura è la quota di margine dentro il venduto del mese.
          const marginShare =
            point.revenueCents > 0
              ? Math.min(Math.max((point.marginCents / point.revenueCents) * 100, 0), 100)
              : 0
          const month = toRome(point.monthStart)
          const title = `${format(month, 'MMMM yyyy', { locale: it })}: venduto ${formatEuro(
            point.revenueCents,
          )}, margine ${formatEuro(point.marginCents)} (${formatPercent(
            ratioBps(point.marginCents, point.revenueCents),
          )})`

          return (
            <div key={point.monthStart} className="flex min-w-0 flex-1 flex-col gap-1.5" title={title}>
              <div className="flex flex-1 items-end justify-center">
                <div
                  className="relative w-full max-w-9 rounded-t-sm bg-accent-subtle transition-colors duration-150 hover:bg-accent-border"
                  style={{ height: `${revenueHeight}%` }}
                >
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-sm bg-accent"
                    style={{ height: `${marginShare}%` }}
                  />
                </div>
              </div>
              <span className="w-full text-center text-micro uppercase text-text-subtle">
                <span className="sm:hidden">{format(month, 'LLLLL', { locale: it })}</span>
                <span className="hidden sm:inline">{format(month, 'LLL yy', { locale: it })}</span>
              </span>
            </div>
          )
        })}
      </div>

      <figcaption className="flex flex-wrap items-center gap-4 text-caption text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent-subtle" aria-hidden="true" /> Venduto
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-accent" aria-hidden="true" /> Margine
        </span>
      </figcaption>

      <table className="sr-only">
        <caption>Venduto e margine per mese</caption>
        <thead>
          <tr>
            <th scope="col">Mese</th>
            <th scope="col">Venduto</th>
            <th scope="col">Margine</th>
            <th scope="col">Pratiche</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.monthStart}>
              <th scope="row">{format(toRome(point.monthStart), 'MMMM yyyy', { locale: it })}</th>
              <td>{formatEuro(point.revenueCents)}</td>
              <td>{formatEuro(point.marginCents)}</td>
              <td>{point.bookingsCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
