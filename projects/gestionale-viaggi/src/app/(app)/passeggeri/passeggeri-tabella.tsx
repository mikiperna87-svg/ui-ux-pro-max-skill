'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { IdCard, Trash2, UsersRound } from 'lucide-react'
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
import type { PassengerRow } from '@/server/queries/anagrafiche'
import { deletePassengersAction } from '@/server/actions/anagrafiche'
import { DOCUMENT_STATES, documentStateInfo } from './config'
import { plurale } from '@/lib/labels'

const DOCUMENT_TYPES = [
  { value: 'passaporto', label: 'Passaporto' },
  { value: 'carta_identita', label: 'Carta d’identità' },
  { value: 'patente', label: 'Patente' },
  { value: 'permesso_soggiorno', label: 'Permesso di soggiorno' },
]

export function PasseggeriTabella({
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  canWrite,
  hasFilters,
}: {
  rows: readonly PassengerRow[]
  total: number
  page: number
  perPage: number
  pageCount: number
  sort: string | null
  direction: 'asc' | 'desc'
  canWrite: boolean
  hasFilters: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  const columns: ColumnDef<PassengerRow, unknown>[] = [
    {
      id: 'full_name',
      header: 'Passeggero',
      cell: ({ row }) => (
        <Link
          href={`/passeggeri/${row.original.id}`}
          className="font-medium text-text underline-offset-2 hover:text-accent hover:underline"
        >
          {row.original.full_name}
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
            className="truncate text-text-muted underline-offset-2 hover:text-accent hover:underline"
          >
            {row.original.customer_name}
          </Link>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'birth_date',
      header: 'Nato il',
      cell: ({ row }) => formatDateShort(row.original.birth_date),
    },
    {
      id: 'document_number',
      header: 'Documento',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.document_number ? (
          <span className="num">{row.original.document_number}</span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      id: 'document_expires_at',
      header: 'Scadenza',
      cell: ({ row }) => {
        const info = documentStateInfo(row.original.document_state)
        return (
          <span className="flex items-center gap-2">
            <span className="num">{formatDateShort(row.original.document_expires_at)}</span>
            <Badge tone={info.tone} dot>
              {info.label}
            </Badge>
          </span>
        )
      },
    },
    {
      id: 'bookings_count',
      header: 'Viaggi',
      meta: { numeric: true },
      cell: ({ row }) => row.original.bookings_count ?? 0,
    },
    {
      id: 'esigenze',
      header: 'Esigenze',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.dietary_needs || row.original.special_needs ? (
          <span className="truncate text-caption text-text-muted">
            {[row.original.dietary_needs, row.original.special_needs].filter(Boolean).join(' · ')}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
  ]

  function remove(ids: readonly string[], reset: () => void) {
    startTransition(async () => {
      const result = await deletePassengersAction(ids)
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
      caption="Elenco dei passeggeri"
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
            placeholder="Cerca per nome, documento, codice fiscale"
            className="w-full sm:w-80"
          />
          <FilterSelect
            name="documento"
            label="Stato documento"
            allLabel="Documento: tutti"
            className="w-56"
            options={DOCUMENT_STATES.map((entry) => ({ value: entry.value, label: entry.label }))}
          />
          <FilterSelect
            name="tipo_documento"
            label="Tipo documento"
            allLabel="Tipo: tutti"
            className="w-52"
            options={DOCUMENT_TYPES}
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
                    ? 'Eliminare il passeggero?'
                    : `Eliminare ${plurale(selectedIds.length, 'passeggero', 'passeggeri')}?`
                }
                description="I passeggeri collegati a una pratica non vengono eliminati."
                confirmLabel="Elimina"
                requireTyping={selectedIds.length > 3 ? String(selectedIds.length) : undefined}
                onConfirm={() => remove(selectedIds, reset)}
              />
            )
          : undefined
      }
      renderCard={(row) => {
        const info = documentStateInfo(row.document_state)
        return (
          <Link
            href={`/passeggeri/${row.id}`}
            className="block rounded-lg border border-border bg-surface p-3 shadow-e1 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium text-text">{row.full_name}</p>
              <Badge tone={info.tone} dot>
                {info.label}
              </Badge>
            </div>
            <p className="mt-1 truncate text-caption text-text-muted">
              {[row.customer_name, formatDateShort(row.birth_date)].filter(Boolean).join(' · ')}
            </p>
            {row.document_number ? (
              <p className="num mt-1 flex items-center gap-1.5 text-caption text-text-muted">
                <IdCard className="size-3" aria-hidden="true" />
                {row.document_number} · scade {formatDateShort(row.document_expires_at)}
              </p>
            ) : null}
          </Link>
        )
      }}
      emptyState={
        hasFilters ? (
          <EmptyState
            icon={<UsersRound />}
            title="Nessun passeggero corrisponde ai filtri"
            description="Prova un altro nome oppure azzera i filtri."
            action={
              <Button asChild variant="secondary">
                <Link href="/passeggeri">Azzera i filtri</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<UsersRound />}
            title="Ancora nessun passeggero"
            description="I passeggeri non coincidono sempre col cliente: familiari, accompagnatori e minori si registrano qui una volta e si riusano in ogni pratica."
            action={
              canWrite ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="primary">
                    <Link href="/passeggeri/nuovo">Nuovo passeggero</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/passeggeri/importa">Importa da CSV</Link>
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
