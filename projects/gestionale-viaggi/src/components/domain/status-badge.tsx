import { Badge } from '@/components/ui/badge'
import type { Enums } from '@/lib/database.types'
import { BOOKING_STATUS, PAYMENT_STATE, PAYOUT_STATUS } from '@/lib/labels'

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
