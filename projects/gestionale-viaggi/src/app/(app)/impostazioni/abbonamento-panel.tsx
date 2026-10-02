import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { CreditCard } from 'lucide-react'
import { formatDateShort } from '@/lib/date'
import { formatEuro } from '@/lib/money'
import type { Tables } from '@/lib/database.types'

const TONO: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  prova: 'info',
  attivo: 'success',
  scaduto: 'warning',
  annullato: 'danger',
}

const ETICHETTA: Record<string, string> = {
  prova: 'In prova',
  attivo: 'Attivo',
  scaduto: 'Scaduto',
  annullato: 'Annullato',
}

const SPIEGAZIONE: Record<string, string> = {
  prova: 'Il periodo di prova è in corso: il gestionale funziona per intero.',
  attivo: 'Tutto in regola.',
  scaduto:
    'Il gestionale è in sola lettura: puoi consultare ed esportare tutto quello che hai registrato, ma non inserire dati nuovi.',
  annullato:
    'L’abbonamento è stato disdetto. Puoi consultare ed esportare i tuoi dati, ma non inserirne di nuovi.',
}

/**
 * L'abbonamento visto dall'agenzia.
 *
 * In sola lettura di proposito: il piano lo cambia chi vende, non chi compra.
 * Serve però che l'agenzia lo veda — sapere quando scade senza doverlo
 * chiedere è la differenza fra un servizio e una sorpresa.
 */
export function AbbonamentoPanel({
  abbonamento,
  piano,
}: {
  abbonamento: Tables<'subscriptions'> | null
  piano: Tables<'plans'> | null
}) {
  if (!abbonamento || !piano) {
    return (
      <EmptyState
        icon={<CreditCard aria-hidden="true" />}
        title="Nessun abbonamento"
        description="Questa installazione non è a canone: il gestionale funziona senza limiti di tempo."
      />
    )
  }

  const scaduto =
    abbonamento.status === 'scaduto' ||
    abbonamento.status === 'annullato' ||
    (abbonamento.valid_until !== null && abbonamento.valid_until < new Date().toISOString().slice(0, 10))

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Abbonamento</CardTitle>
        <Badge tone={scaduto ? TONO.scaduto : TONO[abbonamento.status]} dot>
          {ETICHETTA[abbonamento.status] ?? abbonamento.status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-small text-text-muted">
          {SPIEGAZIONE[abbonamento.status] ?? ''}
        </p>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-small text-text-subtle">Piano</dt>
            <dd className="text-body text-text">{piano.name}</dd>
            {piano.description ? (
              <dd className="text-small text-text-subtle">{piano.description}</dd>
            ) : null}
          </div>
          <div>
            <dt className="text-small text-text-subtle">Scadenza</dt>
            <dd className="text-body text-text">
              {abbonamento.valid_until ? formatDateShort(abbonamento.valid_until) : 'Senza scadenza'}
            </dd>
          </div>
          {piano.price_cents !== null ? (
            <div>
              <dt className="text-small text-text-subtle">Canone</dt>
              <dd className="text-body text-text">{formatEuro(piano.price_cents)} al mese</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-small text-text-subtle">Limiti</dt>
            <dd className="text-body text-text">
              {[
                piano.max_users === null ? 'utenti illimitati' : `fino a ${piano.max_users} utenti`,
                piano.max_bookings === null
                  ? 'pratiche illimitate'
                  : `fino a ${piano.max_bookings} pratiche all’anno`,
              ].join(' · ')}
            </dd>
          </div>
        </dl>

        <p className="text-small text-text-subtle">
          Il piano si cambia contattando chi ti ha fornito il gestionale. In qualunque momento,
          anche a canone scaduto, puoi esportare i tuoi dati dagli elenchi.
        </p>
      </CardContent>
    </Card>
  )
}
