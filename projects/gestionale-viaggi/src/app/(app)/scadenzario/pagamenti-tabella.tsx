'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { BanknoteArrowUp, CalendarClock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SearchField } from '@/components/data-table/search-field'
import { PayoutStatusBadge } from '@/components/domain/status-badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { formatDateShort, formatRelativeDays } from '@/lib/date'
import { plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { markPayoutsAction } from '@/server/actions/incassi'
import type { PayoutRow } from '@/server/queries/incassi'

function Ritardo({ giorni }: { giorni: number | null }) {
  if (giorni === null || giorni <= 0) return null
  return (
    <span className="text-caption font-medium text-danger">
      {plurale(giorni, 'giorno di ritardo', 'giorni di ritardo')}
    </span>
  )
}

export function PagamentiTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  suppliers,
  canManage,
  hasFilters,
}: {
  rows: readonly PayoutRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  suppliers: ReadonlyArray<{ id: string; label: string }>
  canManage: boolean
  hasFilters: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  function segna(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const esito = await markPayoutsAction([...ids], 'pagato')
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Pagamenti aggiornati.')
        reset()
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti ad aggiornare i pagamenti.')
      }
    })
  }

  const columns: ColumnDef<PayoutRow, unknown>[] = [
    {
      id: 'due_date',
      header: 'Scadenza',
      cell: ({ row }) => (
        <div>
          <p className="num font-medium text-text">{formatDateShort(row.original.due_date)}</p>
          <p className="text-caption text-text-muted">
            {row.original.is_late ? (
              <Ritardo giorni={row.original.days_late} />
            ) : (
              formatRelativeDays(row.original.due_date)
            )}
          </p>
        </div>
      ),
    },
    {
      id: 'supplier_name',
      header: 'Fornitore',
      cell: ({ row }) => (
        <Link
          href={`/fornitori/${row.original.supplier_id}`}
          className="block max-w-56 truncate text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.supplier_name ?? '—'}
        </Link>
      ),
    },
    {
      id: 'booking_code',
      header: 'Pratica',
      cell: ({ row }) =>
        row.original.booking_id ? (
          <Link
            href={`/pratiche/${row.original.booking_id}`}
            className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.booking_code}
          </Link>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      id: 'service_description',
      header: 'Servizio',
      cell: ({ row }) => (
        <div className="max-w-64">
          <p className="truncate text-text">{row.original.service_description ?? '—'}</p>
          {row.original.supplier_invoice_number ? (
            <p className="num truncate text-caption text-text-muted">
              fattura {row.original.supplier_invoice_number}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'amount_cents',
      header: 'Importo',
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="font-medium">{formatEuro(row.original.amount_cents ?? 0)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Stato',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          {row.original.status ? <PayoutStatusBadge status={row.original.status} /> : null}
          {row.original.paid_at ? (
            <span className="num text-caption text-text-muted">
              pagato il {formatDateShort(row.original.paid_at)}
            </span>
          ) : null}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      caption="Pagamenti ai fornitori"
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
            placeholder="Cerca per fornitore o pratica"
            className="w-full sm:w-72"
          />
          <FilterSelect
            name="stato"
            label="Stato"
            allLabel="Tutti gli stati"
            className="w-44"
            options={[
              { value: 'aperti', label: 'Ancora da pagare' },
              { value: 'da_pagare', label: 'Da pagare' },
              { value: 'programmato', label: 'Programmati' },
              { value: 'pagato', label: 'Pagati' },
              { value: 'stornato', label: 'Stornati' },
            ]}
          />
          <FilterSelect
            name="quando"
            label="Quando"
            allLabel="Tutte le date"
            className="w-48"
            options={[
              { value: 'in_ritardo', label: 'In ritardo' },
              { value: 'settimana', label: 'Entro 7 giorni' },
              { value: 'mese', label: 'Entro 30 giorni' },
              { value: 'passate', label: 'Già scaduti' },
            ]}
          />
          {suppliers.length > 1 ? (
            <FilterSelect
              name="fornitore"
              label="Fornitore"
              allLabel="Tutti i fornitori"
              className="w-52"
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.label }))}
            />
          ) : null}
        </>
      }
      bulkActions={
        canManage
          ? (selectedIds, reset) => (
              <ConfirmDialog
                trigger={
                  <Button variant="primary" size="sm">
                    <BanknoteArrowUp aria-hidden="true" />
                    Segna pagati
                  </Button>
                }
                title={
                  selectedIds.length === 1
                    ? 'Segnare il pagamento come eseguito?'
                    : `Segnare ${selectedIds.length} pagamenti come eseguiti?`
                }
                description="La data del pagamento sarà quella di oggi. Ogni riga finisce nel registro attività e resta correggibile dalla scheda della pratica."
                confirmLabel="Segna pagati"
                onConfirm={() => segna(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => (
        <div className="rounded-lg border border-border bg-surface p-3 shadow-e1">
          <div className="flex items-start justify-between gap-2">
            <p className="num min-w-0 truncate font-medium text-text">
              {formatDateShort(row.due_date)}
            </p>
            <span className="num shrink-0 text-small font-medium">
              {formatEuro(row.amount_cents ?? 0)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-text">{row.supplier_name ?? '—'}</p>
          <p className="num truncate text-caption text-text-muted">
            {row.booking_code ?? '—'} · {row.service_description ?? '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            {row.status ? <PayoutStatusBadge status={row.status} /> : null}
            {row.is_late ? <Ritardo giorni={row.days_late} /> : null}
          </div>
        </div>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Nessun pagamento corrisponde ai filtri"
            description="Prova ad allargare il periodo o ad azzerare lo stato."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/scadenzario?sezione=pagamenti">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<CalendarClock />}
            title="Nessun pagamento ai fornitori"
            description="I pagamenti nascono dalle righe di servizio con un fornitore: aprili dalla scheda della pratica, sezione Incassi e scadenze."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/pratiche">Vai alle pratiche</Link>
              </Button>
            }
          />
        )
      }
    />
  )
}
