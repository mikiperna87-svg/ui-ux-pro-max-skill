'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Trash2, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { DataTable } from '@/components/data-table/data-table'
import { FilterSelect } from '@/components/data-table/filter-select'
import { SearchField } from '@/components/data-table/search-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { formatDateShort } from '@/lib/date'
import { SUPPLIER_KIND, plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import type { SupplierRow } from '@/server/queries/anagrafiche'
import { deleteSuppliersAction } from '@/server/actions/anagrafiche'

export function FornitoriTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  canWrite,
  showMargins,
  hasFilters,
}: {
  rows: readonly SupplierRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  canWrite: boolean
  showMargins: boolean
  hasFilters: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const columns: ColumnDef<SupplierRow, unknown>[] = [
    {
      id: 'name',
      header: 'Fornitore',
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <Link
            href={`/fornitori/${row.original.id}`}
            className="truncate font-medium text-text underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.name}
          </Link>
          {row.original.is_active === false ? <Badge tone="neutral">Disattivato</Badge> : null}
        </span>
      ),
    },
    {
      id: 'kind',
      header: 'Tipo',
      cell: ({ row }) => (
        <span className="text-text-muted">
          {row.original.kind ? SUPPLIER_KIND[row.original.kind] : '—'}
        </span>
      ),
    },
    {
      id: 'contatti',
      header: 'Contatti',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-0">
          {row.original.email ? (
            <a
              href={`mailto:${row.original.email}`}
              className="block truncate text-text underline-offset-2 hover:text-accent hover:underline"
            >
              {row.original.email}
            </a>
          ) : null}
          {row.original.contact_name ? (
            <span className="block truncate text-caption text-text-muted">
              {row.original.contact_name}
            </span>
          ) : null}
          {!row.original.email && !row.original.contact_name ? (
            <span className="text-text-subtle">—</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'payment_terms_days',
      header: 'Pagamento',
      meta: { numeric: true },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{row.original.payment_terms_days ?? 0} gg</span>
      ),
    },
    {
      id: 'services_count',
      header: 'Servizi',
      meta: { numeric: true },
      cell: ({ row }) => row.original.services_count ?? 0,
    },
    {
      id: 'cost_cents',
      header: 'Acquistato',
      meta: { numeric: true },
      cell: ({ row }) => formatEuro(row.original.cost_cents ?? 0),
    },
    ...(showMargins
      ? [
          {
            id: 'margin_cents',
            header: 'Margine generato',
            meta: { numeric: true },
            cell: ({ row }: { row: { original: SupplierRow } }) => (
              <span className="whitespace-nowrap">
                <span className="text-success">{formatEuro(row.original.margin_cents ?? 0)}</span>
                <span className="ml-1.5 text-caption text-text-muted">
                  {formatPercent(row.original.margin_bps ?? 0, 1)}
                </span>
              </span>
            ),
          } satisfies ColumnDef<SupplierRow, unknown>,
        ]
      : []),
    {
      id: 'open_payable_cents',
      header: 'Da pagare',
      meta: { numeric: true },
      cell: ({ row }) =>
        (row.original.open_payable_cents ?? 0) > 0 ? (
          <span
            className={
              (row.original.overdue_payable_cents ?? 0) > 0 ? 'text-danger' : 'text-warning'
            }
          >
            {formatEuro(row.original.open_payable_cents ?? 0)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'next_due_date',
      header: 'Prossima scadenza',
      cell: ({ row }) => formatDateShort(row.original.next_due_date),
    },
  ]

  function remove(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const result = await deleteSuppliersAction(ids)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Eliminati.')
        reset()
        router.refresh()
      } else {
        toast.error(result.message ?? 'Operazione non riuscita.')
      }
    })
  }

  return (
    <DataTable
      caption="Elenco dei fornitori dell’agenzia"
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
          <SearchField placeholder="Cerca per nome, referente, partita IVA" className="w-full sm:w-80" />
          <FilterSelect
            name="tipo"
            label="Tipo"
            allLabel="Tutti i tipi"
            className="w-52"
            options={Object.entries(SUPPLIER_KIND).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            name="attivo"
            label="Stato"
            allLabel="Attivi e disattivati"
            className="w-48"
            options={[
              { value: 'si', label: 'Solo attivi' },
              { value: 'no', label: 'Solo disattivati' },
            ]}
          />
          <FilterSelect
            name="scaduti"
            label="Scadenze"
            allLabel="Tutte le scadenze"
            className="w-48"
            options={[{ value: 'si', label: 'Con pagamenti scaduti' }]}
          />
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
                    ? 'Eliminare il fornitore?'
                    : `Eliminare ${plurale(selectedIds.length, 'fornitore', 'fornitori')}?`
                }
                description="I fornitori che compaiono in una pratica non vengono eliminati: disattivali dalla loro scheda."
                confirmLabel="Elimina"
                requireTyping={selectedIds.length > 3 ? String(selectedIds.length) : undefined}
                onConfirm={() => remove(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => (
        <Link
          href={`/fornitori/${row.id}`}
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-text">{row.name}</p>
            <span className="num shrink-0 text-small">{formatEuro(row.cost_cents ?? 0)}</span>
          </div>
          <p className="mt-1 truncate text-caption text-text-muted">
            {[row.kind ? SUPPLIER_KIND[row.kind] : null, row.city].filter(Boolean).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            <Badge tone="neutral">Pagamento a {plurale(row.payment_terms_days ?? 0, 'giorno', 'giorni')}</Badge>
            {(row.open_payable_cents ?? 0) > 0 ? (
              <Badge tone={(row.overdue_payable_cents ?? 0) > 0 ? 'danger' : 'warning'}>
                Da pagare {formatEuro(row.open_payable_cents ?? 0)}
              </Badge>
            ) : null}
            {row.is_active === false ? <Badge tone="neutral">Disattivato</Badge> : null}
          </div>
        </Link>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<Truck />}
            title="Nessun fornitore corrisponde ai filtri"
            description="Prova un altro nome oppure azzera i filtri."
            action={
              <Button asChild variant="secondary">
                <Link href="/fornitori">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Truck />}
            title="Ancora nessun fornitore"
            description="Tour operator, compagnie, hotel e corrispondenti: registra condizioni di pagamento e commissioni una volta, e ogni pratica le eredita."
            action={
              canWrite ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="primary">
                    <Link href="/fornitori/nuovo">Nuovo fornitore</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/fornitori/importa">Importa da CSV</Link>
                  </Button>
                </div>
              ) : undefined
            }
          />
        )
      }
    />
  )
}
