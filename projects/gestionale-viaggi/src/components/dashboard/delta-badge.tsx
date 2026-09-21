import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import { formatPercent } from '@/lib/money'
import { cn } from '@/lib/utils'

export interface DeltaBadgeProps {
  /** Variazione in punti base; null quando il termine di paragone è zero. */
  readonly bps: number | null
  /** Che cosa si sta confrontando, letto dagli screen reader per intero. */
  readonly label?: string
  /**
   * Vero quando crescere è una cattiva notizia (il residuo da incassare, i
   * costi): la direzione resta quella vera, cambia solo il giudizio.
   */
  readonly invertito?: boolean
  /** Mostra la direzione senza giudicarla: per i numeri che non hanno un verso buono. */
  readonly neutro?: boolean
}

/**
 * Variazione rispetto al periodo precedente.
 *
 * Direzione, segno e colore dicono la stessa cosa tre volte: la freccia serve
 * a chi non distingue il verde dal rosso, il segno a chi legge in bianco e
 * nero, il colore a chi guarda la pagina di sfuggita. Sotto la soglia dello
 * 0,5 % la variazione si dichiara stabile invece di fingere una precisione
 * che non ha.
 */
export function DeltaBadge({
  bps,
  label = 'sul periodo precedente',
  invertito = false,
  neutro = false,
}: DeltaBadgeProps) {
  if (bps === null) {
    return (
      <span className="text-caption text-text-subtle">Nessun dato nel periodo precedente</span>
    )
  }

  const stabile = Math.abs(bps) < 50
  const salita = bps > 0
  const buono = invertito ? !salita : salita

  const Icona = stabile ? ArrowRight : salita ? ArrowUpRight : ArrowDownRight
  const testo = stabile ? 'stabile' : `${salita ? '+' : ''}${formatPercent(bps, 1)}`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-caption font-medium',
        stabile || neutro ? 'text-text-muted' : buono ? 'text-success' : 'text-danger',
      )}
    >
      <Icona className="size-3.5" aria-hidden="true" />
      <span>{testo}</span>
      <span className="font-normal text-text-muted">{label}</span>
    </span>
  )
}
