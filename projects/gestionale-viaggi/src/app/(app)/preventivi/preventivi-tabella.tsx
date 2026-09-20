'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { CalendarDays, FileText, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SavedViews, type SavedView } from '@/components/data-table/saved-views'
import { SearchField } from '@/components/data-table/search-field'
import { QuoteStatusBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { formatDateShort, formatRelativeDays } from '@/lib/date'
import { QUOTE_VARIANT, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { deleteQuotesAction } from '@/server/actions/preventivi'
import type { QuoteRow } from '@/server/queries/preventivi'

export function PreventiviTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  operators,
  views,
  canWrite,
  canShareViews,
  showMargins,
  hasFilters,
}: {
  rows: readonly QuoteRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  operators: ReadonlyArray<{ id: string; label: string }>
  views: readonly SavedView[]
  canWrite: boolean
  canShareViews: boolean
  showMargins: boolean
  hasFilters: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  function elimina(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const esito = await deleteQuotesAction([...ids])
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Preventivi eliminati.')
        reset()
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare i preventivi.')
      }
    })
  }

  const columns: ColumnDef<QuoteRow, unknown>[] = [
    {
      id: 'code',
      header: 'Preventivo',
      cell: ({ row }) => (
        <Link
          href={`/preventivi/${row.original.id}`}
          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.code}
        </Link>
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
          <span className="text-text-muted">Non indicato</span>
        ),
    },
    {
      id: 'destination',
      header: 'Destinazione',
      cell: ({ row }) => (
        <div className="max-w-64">
          <p className="truncate text-text">{row.original.destination}</p>
          {row.original.title && row.original.title !== row.original.destination ? (
            <p className="truncate text-caption text-text-muted">{row.original.title}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'departure_date',
      header: 'Partenza',
      cell: ({ row }) => (
        <span className="num">{formatDateShort(row.original.departure_date)}</span>
      ),
    },
    {
      id: 'valid_until',
      header: 'Valido fino al',
      cell: ({ row }) =>
        row.original.valid_until ? (
          <div>
            <p className="num text-text">{formatDateShort(row.original.valid_until)}</p>
            <p className="text-caption text-text-muted">
              {row.original.is_expired ? 'scaduto' : formatRelativeDays(row.original.valid_until)}
            </p>
          </div>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'revenue_cents',
      header: 'Proposta',
      meta: { numeric: true },
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{formatEuro(row.original.revenue_cents ?? 0)}</p>
          {row.original.shown_variant ? (
            <p className="text-caption font-normal text-text-muted">
              {QUOTE_VARIANT[row.original.shown_variant].label}
            </p>
          ) : null}
        </div>
      ),
    },
    ...(showMargins
      ? [
          {
            id: 'margin_cents',
            header: 'Margine',
            meta: { numeric: true },
            cell: ({ row }: { row: { original: QuoteRow } }) => (
              <span className="text-success">{formatEuro(row.original.margin_cents ?? 0)}</span>
            ),
          } satisfies ColumnDef<QuoteRow, unknown>,
        ]
      : []),
    {
      id: 'status',
      header: 'Stato',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          {row.original.status ? (
            <QuoteStatusBadge
              status={row.original.status}
              expired={row.original.is_expired ?? false}
            />
          ) : null}
          {row.original.booking_code ? (
            <Link
              href={`/pratiche/${row.original.converted_booking_id}`}
              className="num text-caption text-text-muted underline-offset-2 hover:text-accent hover:underline"
            >
              {row.original.booking_code}
            </Link>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      caption="Elenco dei preventivi"
      columns={columns}
      rows={rows}
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
            placeholder="Cerca per codice, destinazione o cliente"
            className="w-full sm:w-72"
          />
          <SavedViews
            entity="preventivi"
            views={views}
            canWrite={canWrite}
            canShare={canShareViews}
          />
          <FilterSelect
            name="stato"
            label="Stato"
            allLabel="Tutti gli stati"
            className="w-44"
            options={[
              { value: 'aperti', label: 'Da chiudere' },
              { value: 'bozza', label: 'Bozze' },
              { value: 'inviato', label: 'Inviati' },
              { value: 'scaduto', label: 'Scaduti' },
              { value: 'accettato', label: 'Accettati' },
              { value: 'rifiutato', label: 'Rifiutati' },
              { value: 'convertito', label: 'Convertiti' },
            ]}
          />
          <FilterSelect
            name="validita"
            label="Validità"
            allLabel="Qualsiasi validità"
            className="w-48"
            options={[{ value: 'in_scadenza', label: 'Scadono entro 7 giorni' }]}
          />
          {operators.length > 1 ? (
            <FilterSelect
              name="operatore"
              label="Operatore"
              allLabel="Tutti gli operatori"
              className="w-48"
              options={operators.map((operator) => ({ value: operator.id, label: operator.label }))}
            />
          ) : null}
        </>
      }
      bulkActions={
        canWrite
          ? (selectedIds, reset) => (
              <ConfirmDialog
                trigger={
                  <Button variant="danger" size="sm">
                    <Trash2 aria-hidden="true" />
                    Elimina
                  </Button>
                }
                title={
                  selectedIds.length === 1
                    ? 'Eliminare il preventivo?'
                    : `Eliminare ${selectedIds.length} preventivi?`
                }
                description="I preventivi già convertiti in pratica non si eliminano. L’operazione resta nel registro attività."
                confirmLabel="Elimina"
                requireTyping={selectedIds.length > 3 ? String(selectedIds.length) : undefined}
                onConfirm={() => elimina(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => (
        <Link
          href={`/preventivi/${row.id}`}
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="num min-w-0 truncate font-medium text-text">{row.code}</p>
            <span className="num shrink-0 text-small font-medium">
              {formatEuro(row.revenue_cents ?? 0)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-text">{row.destination}</p>
          <p className="truncate text-caption text-text-muted">
            {row.customer_name ?? 'Cliente non indicato'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            {row.status ? (
              <QuoteStatusBadge status={row.status} expired={row.is_expired ?? false} />
            ) : null}
            {row.departure_date ? (
              <span className="num flex items-center gap-1 text-text-muted">
                <CalendarDays className="size-3" aria-hidden="true" />
                {formatDateShort(row.departure_date)}
              </span>
            ) : null}
            <Badge tone="neutral">
              <Users className="size-3" aria-hidden="true" />
              {plurale(row.pax_count ?? 0, 'passeggero', 'passeggeri')}
            </Badge>
          </div>
        </Link>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<FileText />}
            title="Nessun preventivo corrisponde ai filtri"
            description="Prova ad azzerare lo stato o ad allargare la validità."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/preventivi">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="Nessun preventivo"
            description="Un preventivo mette a confronto due o tre proposte per lo stesso viaggio. Quello accettato diventa una pratica in un clic."
            action={
              canWrite ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/preventivi/nuovo">
                    <FileText aria-hidden="true" />
                    Scrivi il primo preventivo
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
