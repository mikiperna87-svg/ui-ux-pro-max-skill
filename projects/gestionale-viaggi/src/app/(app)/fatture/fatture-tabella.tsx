'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { CalendarDays, FileText, Plus, Receipt } from 'lucide-react'
import Link from 'next/link'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SearchField } from '@/components/data-table/search-field'
import { InvoicePaymentStateBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort } from '@/lib/date'
import { INVOICE_KIND, INVOICE_STATUS, VAT_REGIME } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import type { InvoiceRow } from '@/server/queries/fatture'

export function FattureTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  anni,
  canWrite,
  hasFilters,
}: {
  rows: readonly InvoiceRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  anni: readonly number[]
  canWrite: boolean
  hasFilters: boolean
}) {
  const columns: ColumnDef<InvoiceRow, unknown>[] = [
    {
      id: 'code',
      header: 'Numero',
      cell: ({ row }) => (
        <div>
          <Link
            href={`/fatture/${row.original.id}`}
            className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.code ?? 'Bozza'}
          </Link>
          {row.original.kind === 'nota_credito' ? (
            <p className="text-caption text-text-muted">Nota di credito</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'customer_name',
      header: 'Cliente',
      cell: ({ row }) =>
        row.original.customer_id ? (
          <Link
            href={`/clienti/${row.original.customer_id}`}
            className="block max-w-56 truncate text-text underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.customer_name ?? '—'}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'booking_code',
      header: 'Pratica',
      cell: ({ row }) =>
        row.original.booking_id ? (
          <Link
            href={`/pratiche/${row.original.booking_id}`}
            className="num text-text underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.booking_code}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'issue_date',
      header: 'Emissione',
      cell: ({ row }) => (
        <span className="num">
          {row.original.status === 'bozza' ? '—' : formatDateShort(row.original.issue_date)}
        </span>
      ),
    },
    {
      id: 'due_date',
      header: 'Scadenza',
      cell: ({ row }) => (
        <div>
          <span className="num">{formatDateShort(row.original.due_date)}</span>
          {row.original.is_overdue ? (
            <p className="text-caption text-danger-fg">
              in ritardo di {row.original.days_late} giorni
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'taxable_cents',
      header: 'Imponibile',
      cell: ({ row }) => (
        <div className="text-right">
          <p className="num text-text">{formatEuro(row.original.taxable_cents ?? 0)}</p>
          <p className="num text-caption text-text-muted">
            IVA {formatEuro(row.original.vat_cents ?? 0)}
          </p>
        </div>
      ),
    },
    {
      id: 'total_cents',
      header: 'Totale',
      cell: ({ row }) => (
        <div className="text-right">
          <p className="num font-medium text-text">
            {row.original.kind === 'nota_credito' ? '− ' : ''}
            {formatEuro(row.original.total_cents ?? 0)}
          </p>
          {(row.original.residual_cents ?? 0) > 0 && row.original.status !== 'bozza' ? (
            <p className="num text-caption text-text-muted">
              residuo {formatEuro(row.original.residual_cents ?? 0)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Stato',
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          {row.original.status ? (
            <Badge tone={INVOICE_STATUS[row.original.status].tone} dot>
              {INVOICE_STATUS[row.original.status].label}
            </Badge>
          ) : null}
          {/* Lo stato di incasso si mostra solo quando aggiunge qualcosa:
              accanto a "Pagata" ripeterebbe la stessa parola. */}
          {row.original.status === 'emessa' || row.original.status === 'inviata' ? (
            <InvoicePaymentStateBadge state={row.original.payment_state} />
          ) : null}
        </div>
      ),
    },
    {
      id: 'vat_regime',
      header: 'Regime',
      cell: ({ row }) => (
        <span className="text-caption text-text-muted">
          {row.original.vat_regime ? VAT_REGIME[row.original.vat_regime].label : '—'}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns}
      caption="Fatture e note di credito"
      total={total}
      page={page}
      perPage={perPage}
      pageCount={pageCount}
      sort={sort}
      direction={direction}
      getRowId={(row) => row.id ?? ''}
      toolbar={
        <>
          <SearchField
            placeholder="Cerca per numero, cliente o note"
            className="w-full sm:w-72"
          />
          <FilterSelect
            name="tipo"
            label="Tipo"
            allLabel="Tutti i documenti"
            className="w-44"
            options={[
              { value: 'fattura', label: INVOICE_KIND.fattura },
              { value: 'nota_credito', label: INVOICE_KIND.nota_credito },
            ]}
          />
          <FilterSelect
            name="stato"
            label="Stato"
            allLabel="Tutti gli stati"
            className="w-40"
            options={[
              { value: 'bozza', label: 'Bozze' },
              { value: 'emessa', label: 'Emesse' },
              { value: 'inviata', label: 'Inviate' },
              { value: 'pagata', label: 'Pagate' },
            ]}
          />
          <FilterSelect
            name="pagamento"
            label="Incasso"
            allLabel="Qualsiasi incasso"
            className="w-44"
            options={[
              { value: 'da_incassare', label: 'Da incassare' },
              { value: 'in_ritardo', label: 'In ritardo' },
              { value: 'pagata', label: 'Incassate' },
            ]}
          />
          {anni.length > 1 ? (
            <FilterSelect
              name="anno"
              label="Anno"
              allLabel="Tutti gli anni"
              className="w-36"
              options={anni.map((anno) => ({ value: String(anno), label: String(anno) }))}
            />
          ) : null}
        </>
      }
      renderCard={(row) => (
        <Link
          href={`/fatture/${row.id}`}
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="num min-w-0 truncate font-medium text-text">{row.code ?? 'Bozza'}</p>
            <span className="num shrink-0 text-small font-medium">
              {row.kind === 'nota_credito' ? '− ' : ''}
              {formatEuro(row.total_cents ?? 0)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-text">{row.customer_name ?? '—'}</p>
          <p className="num truncate text-caption text-text-muted">
            imponibile {formatEuro(row.taxable_cents ?? 0)} · IVA {formatEuro(row.vat_cents ?? 0)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            {row.status ? (
              <Badge tone={INVOICE_STATUS[row.status].tone} dot>
                {INVOICE_STATUS[row.status].label}
              </Badge>
            ) : null}
            {row.status === 'emessa' || row.status === 'inviata' ? (
              <InvoicePaymentStateBadge state={row.payment_state} />
            ) : null}
            {row.issue_date && row.status !== 'bozza' ? (
              <span className="num flex items-center gap-1 text-text-muted">
                <CalendarDays className="size-3" aria-hidden="true" />
                {formatDateShort(row.issue_date)}
              </span>
            ) : null}
          </div>
        </Link>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<Receipt />}
            title="Nessun documento corrisponde ai filtri"
            description="Prova ad azzerare lo stato o ad allargare il periodo."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/fatture">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="Nessuna fattura"
            description="Una fattura nasce quasi sempre da una pratica: dalla scheda della pratica, «Fattura» ne apre la bozza con le righe già compilate."
            action={
              canWrite ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/fatture/nuova">
                    <Plus aria-hidden="true" />
                    Nuova fattura
                  </Link>
                </Button>
              ) : undefined
            }
          />
        )
      }
    />
  )
}
