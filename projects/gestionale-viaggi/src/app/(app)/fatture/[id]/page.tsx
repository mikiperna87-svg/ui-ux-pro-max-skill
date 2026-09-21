import { CalendarDays, Download, History, Luggage, Pencil, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { InvoicePaymentStateBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateShort, formatDateTime } from '@/lib/date'
import { ACTIVITY_ACTION, INVOICE_KIND, INVOICE_STATUS, VAT_REGIME } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { toCents } from '@/lib/money'
import { getInvoiceDetail } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'
import { AzioniFattura } from './azioni-fattura'
import { RigheFattura } from './righe-fattura'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const detail = await getInvoiceDetail(id)
  if (!detail) return { title: 'Documento' }
  const etichetta = INVOICE_KIND[detail.invoice.kind]
  return { title: detail.invoice.code ? `${etichetta} ${detail.invoice.code}` : `${etichetta} in bozza` }
}

export default async function FatturaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  const detail = await getInvoiceDetail(id)

  if (!detail) notFound()

  const { invoice, summary, items, creditNotes, activity } = detail
  const canWrite = session.permissions.accounting
  const bozza = invoice.status === 'bozza'

  const totals = {
    taxable: toCents(invoice.taxable_cents, 'imponibile'),
    vat: toCents(invoice.vat_cents, 'IVA'),
    total: toCents(invoice.total_cents, 'totale'),
    // Solo le righe in 74-ter: altrove la differenza fra corrispettivo e costo
    // non è una base imponibile e sommarla direbbe una cosa falsa.
    margin: items.reduce(
      (somma, riga) =>
        somma + (riga.vat_regime === 'art_74_ter' ? (riga.margin_cents ?? 0) : 0),
      0,
    ),
  }

  const titolo = invoice.code
    ? `${INVOICE_KIND[invoice.kind]} ${invoice.code}`
    : `${INVOICE_KIND[invoice.kind]} in bozza`

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title={titolo}
        description={[
          summary?.customer_name ?? 'Cliente non indicato',
          bozza ? 'Non ancora numerata' : `Emessa il ${formatDateShort(invoice.issue_date)}`,
          VAT_REGIME[invoice.vat_regime].label,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fatture">Torna all’elenco</Link>
            </Button>
            {!bozza ? (
              <Button asChild variant="secondary" size="sm">
                <a href={`/fatture/${invoice.id}/pdf`} aria-label="Scarica il PDF">
                  <Download aria-hidden="true" />
                  <EtichettaBottone>PDF</EtichettaBottone>
                </a>
              </Button>
            ) : null}
            {bozza && canWrite ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/fatture/${invoice.id}/modifica`}>
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
          <RigheFattura
            invoiceId={invoice.id}
            items={items}
            totals={totals}
            isDraft={bozza}
            canWrite={canWrite}
            defaultVatRegime={invoice.vat_regime}
            defaultVatBps={session.settings.default_vat_bps}
          />

          {invoice.notes || invoice.legal_notes || invoice.payment_terms ? (
            <Card>
              <CardHeader>
                <CardTitle>Che cosa legge il cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoice.payment_terms ? (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                      Condizioni di pagamento
                    </p>
                    <p className="mt-1 text-text">{invoice.payment_terms}</p>
                  </div>
                ) : null}
                {invoice.notes ? (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                      Note
                    </p>
                    <p className="mt-1 whitespace-pre-line text-text">{invoice.notes}</p>
                  </div>
                ) : null}
                {invoice.legal_notes ? (
                  <div>
                    <p className="text-caption font-medium uppercase tracking-wide text-text-subtle">
                      Dicitura di legge
                    </p>
                    <p className="mt-1 whitespace-pre-line text-small text-text-muted">
                      {invoice.legal_notes}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {creditNotes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Note di credito su questo documento</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {creditNotes.map((nota) => (
                    <li key={nota.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/fatture/${nota.id}`}
                          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                        >
                          {nota.code ?? 'Bozza'}
                        </Link>
                        <p className="truncate text-caption text-text-muted">
                          {nota.notes ?? ''}
                          {nota.issue_date && nota.status !== 'bozza'
                            ? ` · ${formatDateShort(nota.issue_date)}`
                            : ''}
                        </p>
                      </div>
                      <p className="num shrink-0 font-medium text-text">
                        − {formatEuro(nota.total_cents ?? 0)}
                      </p>
                    </li>
                  ))}
                </ul>
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
                      <History
                        className="mt-0.5 size-3.5 shrink-0 text-text-subtle"
                        aria-hidden="true"
                      />
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

        <aside aria-label="Riepilogo della fattura" className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader>
              <div className="flex w-full items-center justify-between gap-2">
                <CardTitle>Stato</CardTitle>
                <Badge tone={INVOICE_STATUS[invoice.status].tone} dot>
                  {INVOICE_STATUS[invoice.status].label}
                </Badge>
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
                    <Link
                      href={`/clienti/${invoice.customer_id}`}
                      className="underline-offset-2 hover:text-accent hover:underline"
                    >
                      {summary?.customer_name}
                    </Link>
                  </dd>
                </div>
                {invoice.booking_id ? (
                  <div className="flex justify-between gap-2">
                    <dt className="flex items-center gap-1.5 text-text-muted">
                      <Luggage className="size-3.5" aria-hidden="true" />
                      Pratica
                    </dt>
                    <dd className="text-right">
                      <Link
                        href={`/pratiche/${invoice.booking_id}`}
                        className="num text-text underline-offset-2 hover:text-accent hover:underline"
                      >
                        {summary?.booking_code}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-text-muted">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    Scadenza
                  </dt>
                  <dd className="num text-text">{formatDateShort(invoice.due_date)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Regime IVA</dt>
                  <dd className="text-right text-text">{VAT_REGIME[invoice.vat_regime].label}</dd>
                </div>
                {invoice.sent_at ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-muted">Inviata il</dt>
                    <dd className="num text-text">{formatDateShort(invoice.sent_at)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="space-y-1.5 border-t border-border pt-3">
                <div className="flex justify-between gap-2">
                  <span className="text-text-muted">Totale</span>
                  <span className="num text-heading font-semibold text-text">
                    {invoice.kind === 'nota_credito' ? '− ' : ''}
                    {formatEuro(totals.total)}
                  </span>
                </div>
                {!bozza && invoice.kind === 'fattura' ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Incassato</span>
                      <span className="num text-text">{formatEuro(summary?.paid_cents ?? 0)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-text-muted">Residuo</span>
                      <span className="num font-medium text-text">
                        {formatEuro(summary?.residual_cents ?? 0)}
                      </span>
                    </div>
                    {invoice.status === 'emessa' || invoice.status === 'inviata' ? (
                      <div className="pt-1">
                        <InvoicePaymentStateBadge state={summary?.payment_state ?? null} />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              {summary?.is_overdue ? (
                <Badge tone="danger">
                  Scaduta da {summary.days_late} giorni
                </Badge>
              ) : null}

              {invoice.credit_note_of ? (
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <p className="text-small text-text-muted">Storna la fattura</p>
                  <Link
                    href={`/fatture/${invoice.credit_note_of}`}
                    className="num text-small font-medium text-text underline-offset-2 hover:text-accent hover:underline"
                  >
                    {summary?.credit_note_of_code}
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex flex-col items-end gap-2">
            <AzioniFattura
              invoiceId={invoice.id}
              kind={invoice.kind}
              status={invoice.status}
              code={invoice.code}
              issueDate={invoice.issue_date}
              hasItems={items.length > 0}
              canWrite={canWrite}
              customerEmail={summary?.customer_email ?? null}
              customerName={summary?.customer_name ?? null}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
