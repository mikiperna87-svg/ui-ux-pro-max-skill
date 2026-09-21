import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateShort } from '@/lib/date'
import {
  ETICHETTE_PERIODO,
  MESI_MASSIMI,
  PRESET_PERIODI,
  type Periodo,
} from '@/lib/report-period'
import { cn } from '@/lib/utils'
import type { Vista } from './config'

/**
 * Scelta del periodo.
 *
 * I cinque periodi usati ogni giorno sono collegamenti: si aprono in una
 * scheda nuova, si mettono fra i preferiti e funzionano senza JavaScript. Le
 * date libere stanno in un pannello richiudibile perché su un telefono cinque
 * bottoni più due campi data occuperebbero lo schermo prima ancora che
 * cominci il report; il modulo è un GET, quindi anche quello finisce
 * nell'indirizzo ed è condivisibile.
 */
export function SelettorePeriodo({ periodo, vista }: { periodo: Periodo; vista: Vista }) {
  return (
    <div className="space-y-3">
      <nav aria-label="Periodo" className="flex flex-wrap items-center gap-1.5">
        {PRESET_PERIODI.map((preset) => {
          const attivo = periodo.chiave === preset
          return (
            <Link
              key={preset}
              href={`/report?vista=${vista}&periodo=${preset}`}
              aria-current={attivo ? 'true' : undefined}
              className={cn(
                'rounded-md border px-3 py-1.5 text-small transition-colors duration-150',
                attivo
                  ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                  : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {ETICHETTE_PERIODO[preset]}
            </Link>
          )
        })}
      </nav>

      <details className="group" open={periodo.chiave === 'personalizzato'}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-small text-text-muted hover:text-text focus-visible:outline-none group-open:text-text [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">
            ›
          </span>
          Periodo personalizzato
        </summary>

        <form
          method="get"
          action="/report"
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2 p-3"
        >
          <input type="hidden" name="vista" value={vista} />
          <div className="space-y-1">
            <label htmlFor="periodo-da" className="block text-caption font-medium text-text-muted">
              Dal
            </label>
            <Input
              id="periodo-da"
              name="da"
              type="date"
              defaultValue={periodo.from}
              className="w-[10.5rem]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="periodo-a" className="block text-caption font-medium text-text-muted">
              Al
            </label>
            <Input
              id="periodo-a"
              name="a"
              type="date"
              defaultValue={periodo.to}
              className="w-[10.5rem]"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Applica
          </Button>
          <p className="w-full text-caption text-text-muted sm:w-auto">
            Al massimo {MESI_MASSIMI} mesi per volta.
          </p>
        </form>
      </details>

      {periodo.troncato ? (
        <p className="rounded-md border border-warning-subtle bg-warning-subtle/50 px-3 py-2 text-small text-warning-fg">
          Il periodo chiesto superava i {MESI_MASSIMI} mesi: il report si ferma al{' '}
          {formatDateShort(periodo.to)}.
        </p>
      ) : null}
    </div>
  )
}
