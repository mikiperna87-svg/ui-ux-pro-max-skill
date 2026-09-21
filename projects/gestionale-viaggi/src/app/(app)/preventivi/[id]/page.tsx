import { CalendarDays, Download, History, Pencil, UserRound, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { QuoteStatusBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateLong, formatDateShort, formatDateTime } from '@/lib/date'
import { ACTIVITY_ACTION, QUOTE_VARIANT, SALE_TYPE, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { supplierOptions } from '@/server/queries/pratiche'
import { getQuoteDetail } from '@/server/queries/preventivi'
import { requireSession } from '@/server/session'
import { AzioniPreventivo } from './azioni-preventivo'
import { ProposteVarianti } from './proposte-preventivo'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getQuoteDetail(id)
  return { title: detail ? `${detail.quote.code} · ${detail.quote.destination}` : 'Preventivo' }
}

export default async function PreventivoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const detail = await getQuoteDetail(id)

  if (!detail) notFound()

  const { quote, summary, items, totals, activity } = detail
  const canWrite = session.permissions.write
  const showMargins = session.permissions.margins

  const suppliers = canWrite ? await supplierOptions() : []
  const variantiDisponibili = totals
    .filter((riga) => (riga.items_count ?? 0) > 0)
    .map((riga) => riga.variant)
    .filter((variante): variante is NonNullable<typeof variante> => variante !== null)

  const accettata = totals.find((riga) => riga.variant === quote.accepted_variant)

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title={`${quote.code} · ${quote.destination}`}
        description={[
          quote.title,
          summary?.customer_name ?? 'Cliente non indicato',
          quote.departure_date ? `Partenza il ${formatDateLong(quote.departure_date)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/preventivi">Torna all’elenco</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/preventivi/${quote.id}/pdf`} aria-label="Scarica il PDF">
                <Download aria-hidden="true" />
                <span className="hidden sm:inline">PDF</span>
              </a>
            </Button>
            {canWrite ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/preventivi/${quote.id}/modifica`}>
                  <Pencil aria-hidden="true" />
                  Modifica
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <ProposteVarianti
            quoteId={quote.id}
            items={items}
            totals={totals}
            suppliers={suppliers}
            canWrite={canWrite}
            showMargins={showMargins}
            acceptedVariant={quote.accepted_variant}
            defaultVatBps={session.settings.default_vat_bps}
            defaultVatRegime={quote.sale_type === 'organizzazione' ? 'art_74_ter' : 'ordinaria'}
          />

          {quote.intro_text || quote.terms_text ? (
            <Card>
              <CardHeader>
                <CardTitle>Che cosa legge il cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quote.intro_text ? (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                      Introduzione
                    </p>
                    <p className="mt-1 whitespace-pre-line text-text">{quote.intro_text}</p>
                  </div>
                ) : null}
                {quote.terms_text ? (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                      Condizioni
                    </p>
                    <p className="mt-1 whitespace-pre-line text-small text-text-muted">
                      {quote.terms_text}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {activity.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Cronologia</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {activity.map((voce) => (
                    <li key={voce.id} className="flex items-start gap-3 px-4 py-2.5">
                      <History className="mt-0.5 size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-small text-text">{voce.summary}</p>
                        <p className="text-caption text-text-muted">
                          {voce.actor_label} · {formatDateTime(voce.created_at)} ·{' '}
                          {ACTIVITY_ACTION[voce.action]}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <div className="flex w-full items-center justify-between gap-2">
                <CardTitle>Stato</CardTitle>
                <QuoteStatusBadge
                  status={quote.status}
                  expired={summary?.is_expired ?? false}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-small">
              <dl className="space-y-2">
                <div className="flex justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-text-muted">
                    <UserRound className="size-3.5" aria-hidden="true" />
                    Cliente
                  </dt>
                  <dd className="text-right text-text">
                    {quote.customer_id ? (
                      <Link
                        href={`/clienti/${quote.customer_id}`}
                        className="underline-offset-2 hover:text-accent hover:underline"
                      >
                        {summary?.customer_name}
                      </Link>
                    ) : (
                      'Non indicato'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-text-muted">
                    <Users className="size-3.5" aria-hidden="true" />
                    Passeggeri
                  </dt>
                  <dd className="num text-text">{quote.pax_count}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-text-muted">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Valido fino al
                  </dt>
                  <dd className="num text-text">{formatDateShort(quote.valid_until)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Tipo di vendita</dt>
                  <dd className="text-text">{SALE_TYPE[quote.sale_type]}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Operatore</dt>
                  <dd className="text-text">{summary?.owner_name ?? '—'}</dd>
                </div>
                {quote.sent_at ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">Inviato il</dt>
                    <dd className="num text-text">{formatDateShort(quote.sent_at)}</dd>
                  </div>
                ) : null}
              </dl>

              {quote.accepted_at ? (
                <div className="rounded-md border border-success-subtle bg-success-subtle/40 p-3">
                  <p className="text-small font-medium text-success-fg">
                    Accettato: {quote.accepted_variant ? QUOTE_VARIANT[quote.accepted_variant].label : ''}
                  </p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    da {quote.accepted_by_name} il {formatDateTime(quote.accepted_at)}
                  </p>
                  {accettata ? (
                    <p className="num mt-1.5 text-heading font-semibold text-text">
                      {formatEuro(accettata.revenue_cents ?? 0)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {quote.rejected_at ? (
                <div className="rounded-md border border-danger-subtle bg-danger-subtle/40 p-3">
                  <p className="text-small font-medium text-danger-fg">Rifiutato dal cliente</p>
                  <p className="mt-0.5 text-caption text-text-muted">
                    {formatDateTime(quote.rejected_at)}
                    {quote.rejection_reason ? ` · ${quote.rejection_reason}` : ''}
                  </p>
                </div>
              ) : null}

              {quote.converted_booking_id ? (
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-small text-text-muted">Diventato la pratica</p>
                  <Link
                    href={`/pratiche/${quote.converted_booking_id}`}
                    className="num text-small font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                  >
                    {summary?.booking_code}
                  </Link>
                </div>
              ) : null}

              {quote.notes ? (
                <div>
                  <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                    Note interne
                  </p>
                  <p className="mt-1 whitespace-pre-line text-small text-text-muted">{quote.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <AzioniPreventivo
            quoteId={quote.id}
            status={quote.status}
            acceptedVariant={quote.accepted_variant}
            convertedBookingId={quote.converted_booking_id}
            variantiDisponibili={variantiDisponibili}
            canWrite={canWrite}
            customerEmail={summary?.customer_email ?? null}
            customerName={summary?.customer_name ?? null}
          />

          {summary?.is_expired ? (
            <Badge tone="warning">
              Scaduto il {formatDateShort(quote.valid_until)}: il cliente non può più rispondere
            </Badge>
          ) : null}

          {items.length === 0 ? (
            <p className="text-caption text-text-muted">
              {plurale(0, 'voce', 'voci')} inserite: prima di inviare, costruisci almeno una
              proposta.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
