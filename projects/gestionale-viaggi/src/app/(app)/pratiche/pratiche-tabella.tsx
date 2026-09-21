'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { CalendarDays, Luggage, Trash2, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SavedViews, type SavedView } from '@/components/data-table/saved-views'
import { SearchField } from '@/components/data-table/search-field'
import { BookingStatusBadge, PaymentStateBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { formatDateShort } from '@/lib/date'
import { plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { deleteBookingsAction } from '@/server/actions/pratiche'
import type { BookingRow } from '@/server/queries/pratiche'

export function PraticheTabella({
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
  rows: readonly BookingRow[]
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

  function remove(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const esito = await deleteBookingsAction(ids)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Pratiche eliminate.')
        reset()
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a eliminare le pratiche.')
      }
    })
  }

  const columns: ColumnDef<BookingRow, unknown>[] = [
    {
      id: 'code',
      header: 'Pratica',
      cell: ({ row }) => (
        <Link
          href={`/pratiche/${row.original.id}`}
          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      id: 'customer_name',
      header: 'Cliente',
      cell: ({ row }) => (
        <Link
          href={`/clienti/${row.original.customer_id}`}
          className="block max-w-56 truncate text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.customer_name ?? '—'}
        </Link>
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
        <span className="num whitespace-nowrap">
          {row.original.departure_date ? formatDateShort(row.original.departure_date) : '—'}
        </span>
      ),
    },
    {
      id: 'pax_count',
      header: 'Pax',
      meta: { numeric: true },
      cell: ({ row }) => <span className="num">{row.original.pax_count ?? 0}</span>,
    },
    {
      id: 'status',
      header: 'Stato',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status ? <BookingStatusBadge status={row.original.status} /> : null,
    },
    {
      id: 'revenue_cents',
      header: 'Venduto',
      meta: { numeric: true },
      cell: ({ row }) => formatEuro(row.original.revenue_cents ?? 0),
    },
    ...(showMargins
      ? [
          {
            id: 'margin_cents',
            header: 'Margine',
            meta: { numeric: true },
            cell: ({ row }: { row: { original: BookingRow } }) => (
              <span className="text-success">
                {formatEuro(row.original.margin_cents ?? 0)}
                <span className="ml-1 text-caption text-text-subtle">
                  {formatPercent(row.original.margin_bps ?? 0, 1)}
                </span>
              </span>
            ),
          } satisfies ColumnDef<BookingRow, unknown>,
        ]
      : []),
    {
      id: 'balance_cents',
      header: 'Da incassare',
      meta: { numeric: true },
      cell: ({ row }) =>
        (row.original.balance_cents ?? 0) > 0 ? (
          <span className="text-warning-strong">{formatEuro(row.original.balance_cents ?? 0)}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'payment_state',
      header: 'Pagamento',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.payment_state ? (
          <PaymentStateBadge state={row.original.payment_state} />
        ) : null,
    },
  ]

  return (
    <DataTable
      caption="Elenco delle pratiche di viaggio"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      perPage={perPage}
      pageCount={pageCount}
      sort={sort}
      direction={direction}
      getRowId={(row) => row.id ?? ''}
      ricerca={
        <SearchField
          placeholder="Cerca per codice, titolo, destinazione"
          className="w-full sm:w-72"
        />
      }
      toolbar={
        <>
          <SavedViews
            entity="pratiche"
            views={views}
            canWrite={canWrite}
            canShare={canShareViews}
          />
          <FilterSelect
            name="stato"
            label="Stato"
            allLabel="Tutti gli stati"
            className="w-40"
            options={[
              { value: 'aperte', label: 'Aperte' },
              { value: 'opzione', label: 'In opzione' },
              { value: 'confermata', label: 'Confermate' },
              { value: 'partita', label: 'Partite' },
              { value: 'rientrata', label: 'Rientrate' },
              { value: 'annullata', label: 'Annullate' },
            ]}
          />
          <FilterSelect
            name="pagamento"
            label="Pagamento"
            allLabel="Tutti i pagamenti"
            className="w-44"
            options={[
              { value: 'non_pagata', label: 'Non pagate' },
              { value: 'acconto_versato', label: 'Acconto versato' },
              { value: 'saldata', label: 'Saldate' },
              { value: 'in_ritardo', label: 'In ritardo' },
            ]}
          />
          <FilterSelect
            name="periodo"
            label="Periodo"
            allLabel="Tutte le partenze"
            className="w-44"
            options={[
              { value: 'in_partenza', label: 'Partono entro 30 giorni' },
              { value: 'mese', label: 'Partenze di questo mese' },
              { value: 'future', label: 'Partenze future' },
              { value: 'passate', label: 'Già partite' },
            ]}
          />
          <FilterSelect
            name="tipo"
            label="Tipo"
            allLabel="Ogni tipo di vendita"
            className="w-48"
            options={[
              { value: 'intermediazione', label: 'Intermediazione' },
              { value: 'organizzazione', label: 'Organizzazione' },
            ]}
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
                    ? 'Eliminare la pratica?'
                    : `Eliminare ${plurale(selectedIds.length, 'pratica', 'pratiche')}?`
                }
                description="Le pratiche con incassi registrati non si eliminano: quelle si annullano dalla scheda, indicando il motivo. L’operazione resta nel registro attività."
                confirmLabel="Elimina"
                requireTyping={selectedIds.length > 3 ? String(selectedIds.length) : undefined}
                onConfirm={() => remove(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => (
        <Link
          href={`/pratiche/${row.id}`}
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="num min-w-0 truncate font-medium text-text">{row.code}</p>
            <span className="num shrink-0 text-small font-medium">
              {formatEuro(row.revenue_cents ?? 0)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-text">{row.destination}</p>
          <p className="truncate text-caption text-text-muted">{row.customer_name ?? '—'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            {row.status ? <BookingStatusBadge status={row.status} /> : null}
            {row.payment_state ? <PaymentStateBadge state={row.payment_state} /> : null}
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
            icon={<Luggage />}
            title="Nessuna pratica corrisponde ai filtri"
            description="Prova ad allargare il periodo o ad azzerare lo stato."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/pratiche">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Luggage />}
            title="Nessuna pratica aperta"
            description="La pratica è il contenitore di un viaggio: cliente, passeggeri, servizi, incassi e scadenze."
            action={
              canWrite ? (
                <Button asChild variant="primary" size="sm">
                  <Link href="/pratiche/nuova">
                    <Luggage aria-hidden="true" />
                    Apri la prima pratica
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
