import { Badge } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'
import {
  BOOKING_STATUS,
  INSTALLMENT_STATE,
  PAYMENT_STATE,
  PAYOUT_STATUS,
  isInstallmentState,
} from '@/lib/labels'

/** Stato della pratica: colore e testo insieme, mai il colore da solo. */
export function BookingStatusBadge({ status }: { status: Enums['booking_status'] }) {
  const { label, tone } = BOOKING_STATUS[status]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

export function PaymentStateBadge({ state }: { state: Enums['payment_state'] }) {
  const { label, tone } = PAYMENT_STATE[state]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

export function PayoutStatusBadge({ status }: { status: Enums['payout_status'] }) {
  const { label, tone } = PAYOUT_STATUS[status]
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}

/**
 * Stato di una scadenza. Accetta anche una stringa sconosciuta perché il valore
 * arriva da una vista e non da un enum: meglio un "Da incassare" prudente che
 * una pagina che si rompe se un giorno la vista imparasse un nuovo stato.
 */
export function InstallmentStateBadge({ state }: { state: string | null }) {
  const { label, tone } = INSTALLMENT_STATE[isInstallmentState(state) ? state : 'attesa']
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  )
}
