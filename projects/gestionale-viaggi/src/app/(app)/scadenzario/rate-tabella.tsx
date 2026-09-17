'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SearchField } from '@/components/data-table/search-field'
import { InstallmentStateBadge } from '@/components/domain/status-badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatRelativeDays } from '@/lib/date'
import { INSTALLMENT_KIND, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { InstallmentRow } from '@/server/queries/incassi'

/** Il ritardo si legge come testo, non solo come colore della riga. */
function Ritardo({ giorni }: { giorni: number | null }) {
  if (giorni === null || giorni <= 0) return null
  return (
    <span className="text-caption font-medium text-danger">
      {plurale(giorni, 'giorno di ritardo', 'giorni di ritardo')}
    </span>
  )
}

export function RateTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  operators,
  canManage,
  hasFilters,
}: {
  rows: readonly InstallmentRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  operators: ReadonlyArray<{ id: string; label: string }>
  canManage: boolean
  hasFilters: boolean
}) {
  const columns: ColumnDef<InstallmentRow, unknown>[] = [
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
      id: 'booking_code',
      header: 'Pratica',
      cell: ({ row }) => (
        <Link
          href={`/pratiche/${row.original.booking_id}`}
          className="num font-medium text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.booking_code}
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
        <div className="max-w-56">
          <p className="truncate text-text">{row.original.destination ?? '—'}</p>
          {row.original.departure_date ? (
            <p className="num truncate text-caption text-text-muted">
              parte il {formatDateShort(row.original.departure_date)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'kind',
      header: 'Tipo',
      cell: ({ row }) =>
        row.original.kind ? INSTALLMENT_KIND[row.original.kind] : '—',
    },
    {
      id: 'amount_cents',
      header: 'Importo',
      meta: { numeric: true },
      cell: ({ row }) => formatEuro(row.original.amount_cents ?? 0),
    },
    {
      id: 'residual_cents',
      header: 'Residuo',
      meta: { numeric: true },
      cell: ({ row }) => (
        <span
          className={cn(
            'font-medium',
            (row.original.residual_cents ?? 0) > 0 ? 'text-text' : 'text-text-muted',
          )}
        >
          {formatEuro(row.original.residual_cents ?? 0)}
        </span>
      ),
    },
    {
      id: 'state',
      header: 'Stato',
      cell: ({ row }) => <InstallmentStateBadge state={row.original.state} />,
    },
    {
      id: 'azioni',
      header: '',
      cell: ({ row }) =>
        canManage && (row.original.residual_cents ?? 0) > 0 ? (
          <Button asChild variant="secondary" size="sm">
            <Link
              href={`/pratiche/${row.original.booking_id}?scheda=incassi&rata=${row.original.id}`}
              aria-label={`Registra l’incasso della scadenza del ${formatDateShort(row.original.due_date)} sulla pratica ${row.original.booking_code}`}
            >
              <CheckCircle2 aria-hidden="true" />
              Incassa
            </Link>
          </Button>
        ) : null,
    },
  ]

  return (
    <DataTable
      caption="Scadenze verso i clienti"
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
            placeholder="Cerca per pratica, destinazione o cliente"
            className="w-full sm:w-72"
          />
          <FilterSelect
            name="stato"
            label="Stato"
            allLabel="Tutti gli stati"
            className="w-44"
            options={[
              { value: 'aperte', label: 'Ancora aperte' },
              { value: 'scaduta', label: 'Scadute' },
              { value: 'parziale', label: 'Parziali' },
              { value: 'attesa', label: 'Da incassare' },
              { value: 'saldata', label: 'Saldate' },
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
              { value: 'passate', label: 'Già scadute' },
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
      renderCard={(row) => (
        // Su telefono la scheda è il comando: porta alla pratica con il modulo
        // d'incasso già aperto sulla scadenza giusta, come fa "Incassa" sulla
        // tabella, e ne porta anche l'etichetta per chi legge con lo schermo.
        <Link
          href={
            canManage && (row.residual_cents ?? 0) > 0
              ? `/pratiche/${row.booking_id}?scheda=incassi&rata=${row.id}`
              : `/pratiche/${row.booking_id}?scheda=incassi`
          }
          aria-label={
            canManage && (row.residual_cents ?? 0) > 0
              ? `Registra l’incasso della scadenza del ${formatDateShort(row.due_date)} sulla pratica ${row.booking_code}`
              : undefined
          }
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="num min-w-0 truncate font-medium text-text">
              {formatDateShort(row.due_date)}
            </p>
            <span className="num shrink-0 text-small font-medium">
              {formatEuro(row.residual_cents ?? 0)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-text">{row.customer_name ?? '—'}</p>
          <p className="num truncate text-caption text-text-muted">
            {row.booking_code} · {row.destination ?? '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            <InstallmentStateBadge state={row.state} />
            {row.is_late ? <Ritardo giorni={row.days_late} /> : null}
          </div>
        </Link>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<CalendarClock />}
            title="Nessuna scadenza corrisponde ai filtri"
            description="Prova ad allargare il periodo o ad azzerare lo stato."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/scadenzario?sezione=incassi">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<CalendarClock />}
            title="Nessuna scadenza aperta"
            description="Le scadenze nascono alla conferma di una pratica: acconto e saldo secondo i parametri dell’agenzia."
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
