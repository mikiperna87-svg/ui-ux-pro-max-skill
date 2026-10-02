'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { Building2, Trash2, UserRound, Users } from 'lucide-react'
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
import { formatEuro } from '@/lib/money'
import type { CustomerRow } from '@/server/queries/anagrafiche'
import { deleteCustomersAction } from '@/server/actions/anagrafiche'
import { plurale } from '@/lib/labels'

export function ClientiTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  tags,
  canWrite,
  showMargins,
  hasFilters,
}: {
  rows: readonly CustomerRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  tags: readonly string[]
  canWrite: boolean
  showMargins: boolean
  hasFilters: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const columns: ColumnDef<CustomerRow, unknown>[] = [
    {
      id: 'display_name',
      header: 'Cliente',
      cell: ({ row }) => (
        <Link
          href={`/clienti/${row.original.id}`}
          className="flex items-center gap-2 font-medium text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.kind === 'azienda' ? (
            <Building2 className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
          ) : (
            <UserRound className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
          )}
          <span className="truncate">{row.original.display_name ?? '(senza nome)'}</span>
          {row.original.anonymized_at ? <Badge tone="neutral">Anonimizzato</Badge> : null}
        </Link>
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
          {row.original.phone || row.original.mobile ? (
            <span className="num block text-caption text-text-muted">
              {row.original.mobile ?? row.original.phone}
            </span>
          ) : null}
          {!row.original.email && !row.original.phone && !row.original.mobile ? (
            <span className="text-text-subtle">—</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'city',
      header: 'Città',
      cell: ({ row }) =>
        row.original.city ? (
          <span>
            {row.original.city}
            {row.original.province ? (
              <span className="text-text-muted"> ({row.original.province})</span>
            ) : null}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'tags',
      header: 'Tag',
      enableSorting: false,
      cell: ({ row }) =>
        (row.original.tags ?? []).length === 0 ? (
          <span className="text-text-subtle">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {(row.original.tags ?? []).map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
              </Badge>
            ))}
          </span>
        ),
    },
    {
      id: 'bookings_count',
      header: 'Pratiche',
      meta: { numeric: true },
      cell: ({ row }) => row.original.bookings_count ?? 0,
    },
    {
      id: 'lifetime_value_cents',
      header: 'Valore',
      meta: { numeric: true },
      cell: ({ row }) => formatEuro(row.original.lifetime_value_cents ?? 0),
    },
    ...(showMargins
      ? [
          {
            id: 'lifetime_margin_cents',
            header: 'Margine',
            meta: { numeric: true },
            cell: ({ row }: { row: { original: CustomerRow } }) => (
              <span className="text-success">{formatEuro(row.original.lifetime_margin_cents ?? 0)}</span>
            ),
          } satisfies ColumnDef<CustomerRow, unknown>,
        ]
      : []),
    {
      id: 'open_balance_cents',
      header: 'Da incassare',
      meta: { numeric: true },
      cell: ({ row }) =>
        (row.original.open_balance_cents ?? 0) > 0 ? (
          <span className="text-warning">{formatEuro(row.original.open_balance_cents ?? 0)}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'next_departure',
      header: 'Prossima partenza',
      cell: ({ row }) => formatDateShort(row.original.next_departure),
    },
  ]

  function remove(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const result = await deleteCustomersAction(ids)
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
      caption="Elenco dei clienti dell’agenzia"
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
        <SearchField placeholder="Cerca per nome, email, telefono, codice fiscale" className="w-full sm:w-80" />
      }
      toolbar={
        <>
          <FilterSelect
            name="tipo"
            label="Tipo"
            allLabel="Privati e aziende"
            className="w-40"
            options={[
              { value: 'privato', label: 'Privati' },
              { value: 'azienda', label: 'Aziende' },
            ]}
          />
          <FilterSelect
            name="attivita"
            label="Attività"
            allLabel="Tutti i clienti"
            className="w-44"
            options={[
              { value: 'con_pratiche', label: 'Con pratiche' },
              { value: 'senza_pratiche', label: 'Senza pratiche' },
            ]}
          />
          {tags.length > 0 ? (
            <FilterSelect
              name="tag"
              label="Tag"
              allLabel="Tutti i tag"
              className="w-36"
              options={tags.map((tag) => ({ value: tag, label: tag }))}
            />
          ) : null}
          <FilterSelect
            name="consenso"
            label="Marketing"
            allLabel="Consenso: tutti"
            className="w-44"
            options={[
              { value: 'si', label: 'Con consenso' },
              { value: 'no', label: 'Senza consenso' },
            ]}
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
                    ? 'Eliminare il cliente?'
                    : `Eliminare ${plurale(selectedIds.length, 'cliente', 'clienti')}?`
                }
                description="I clienti con pratiche collegate non vengono eliminati: per quelli usa l’anonimizzazione dalla scheda. L’operazione resta nel registro attività."
                confirmLabel="Elimina"
                requireTyping={selectedIds.length > 3 ? String(selectedIds.length) : undefined}
                onConfirm={() => remove(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => (
        <Link
          href={`/clienti/${row.id}`}
          className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 font-medium text-text">
              {row.kind === 'azienda' ? (
                <Building2 className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
              ) : (
                <UserRound className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
              )}
              <span className="truncate">{row.display_name ?? '(senza nome)'}</span>
            </p>
            <span className="num shrink-0 text-small font-medium">
              {formatEuro(row.lifetime_value_cents ?? 0)}
            </span>
          </div>
          <p className="mt-1 truncate text-caption text-text-muted">
            {[row.email, row.city].filter(Boolean).join(' · ') || 'Nessun contatto'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
            <Badge tone="neutral">
              <Users className="size-3" aria-hidden="true" />
              {plurale(row.bookings_count ?? 0, 'pratica', 'pratiche')}
            </Badge>
            {(row.open_balance_cents ?? 0) > 0 ? (
              <Badge tone="warning">Da incassare {formatEuro(row.open_balance_cents ?? 0)}</Badge>
            ) : null}
            {row.next_departure ? (
              <span className="num text-text-muted">Parte il {formatDateShort(row.next_departure)}</span>
            ) : null}
          </div>
        </Link>
      )}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<Users />}
            title="Nessun cliente corrisponde ai filtri"
            description="Prova a cercare un altro nome oppure azzera i filtri per vedere tutti i clienti."
            action={
              <Button asChild variant="secondary">
                <Link href="/clienti">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Users />}
            title="Ancora nessun cliente"
            description="Inserisci il primo cliente oppure importa l’anagrafica che usi oggi da un file CSV."
            action={
              canWrite ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="primary">
                    <Link href="/clienti/nuovo">Nuovo cliente</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/clienti/importa">Importa da CSV</Link>
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
