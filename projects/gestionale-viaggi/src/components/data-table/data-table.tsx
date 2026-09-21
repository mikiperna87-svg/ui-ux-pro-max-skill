'use client'

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, SlidersHorizontal } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useId, useMemo, useState, useTransition, type ReactNode } from 'react'
import { Pagination } from '@/components/data-table/pagination'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { buildListHref } from '@/lib/list-params'
import { cn } from '@/lib/utils'

export interface DataTableProps<T> {
  readonly columns: readonly ColumnDef<T, unknown>[]
  readonly rows: readonly T[]
  readonly total: number
  readonly page: number
  readonly perPage: number
  readonly pageCount: number
  readonly sort: string | null
  readonly direction: 'asc' | 'desc'
  readonly getRowId: (row: T) => string
  /** Resa della riga su schermo stretto: la tabella diventa un elenco di schede. */
  readonly renderCard: (row: T) => ReactNode
  readonly emptyState: ReactNode
  /** Azioni di massa sulle righe selezionate; assente = nessuna selezione. */
  readonly bulkActions?: (selectedIds: readonly string[], reset: () => void) => ReactNode
  /** I filtri: su schermo stretto si aprono e si chiudono. */
  readonly toolbar?: ReactNode
  /**
   * Il campo di ricerca, che resta sempre a schermo.
   *
   * Sta fuori dai filtri perché è il comando che si usa per primo e più
   * spesso: nasconderlo dietro un pulsante vorrebbe dire due gesti al posto
   * di uno, ogni volta.
   */
  readonly ricerca?: ReactNode
  readonly caption: string
}

/**
 * I parametri che descrivono *come* si guarda l'elenco, non *che cosa* si
 * guarda: tutto il resto nell'indirizzo è un filtro, e va contato.
 */
const PARAMETRI_STRUTTURALI = new Set(['q', 'pagina', 'per', 'ordina', 'verso'])

/**
 * Griglia dati del gestionale.
 *
 * Ordinamento, pagina e filtri stanno nell'indirizzo e vengono risolti dal
 * server: il browser non riceve mai più righe di quelle che mostra. Su schermo
 * stretto la tabella lascia il posto a un elenco di schede, perché una tabella
 * a nove colonne su 390 px non si legge.
 */
export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  perPage,
  pageCount,
  sort,
  direction,
  getRowId,
  renderCard,
  emptyState,
  bulkActions,
  toolbar,
  ricerca,
  caption,
}: DataTableProps<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [hidden, setHidden] = useState<VisibilityState>({})

  // Su un telefono da 390 px i filtri di questo elenco occupavano più di uno
  // schermo intero: per vedere la prima riga bisognava scorrere oltre sei
  // menu a tendina. Qui si aprono quando servono, e il numero sul pulsante
  // dice quanti sono attivi anche da chiusi — un elenco filtrato senza che si
  // veda perché è peggio di un filtro in più da aprire.
  const [filtriAperti, setFiltriAperti] = useState(false)
  const idFiltri = useId()
  const filtriAttivi = useMemo(() => {
    let quanti = 0
    for (const [chiave, valore] of searchParams.entries()) {
      if (!PARAMETRI_STRUTTURALI.has(chiave) && valore !== '') quanti += 1
    }
    return quanti
  }, [searchParams])

  const table = useReactTable({
    data: rows as T[],
    columns: columns as ColumnDef<T, unknown>[],
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => getRowId(row),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    enableRowSelection: Boolean(bulkActions),
    state: { rowSelection: selection, columnVisibility: hidden },
    onRowSelectionChange: (updater) =>
      setSelection((current) => (typeof updater === 'function' ? updater(current) : updater)),
    onColumnVisibilityChange: setHidden,
  })

  const selectedIds = Object.keys(selection).filter((id) => selection[id])
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selection[getRowId(row)])
  const someVisibleSelected = rows.some((row) => selection[getRowId(row)])

  function toggleSort(columnId: string) {
    const nextDirection = sort === columnId && direction === 'asc' ? 'desc' : 'asc'
    const params = Object.fromEntries(searchParams.entries())
    const href = buildListHref(pathname, params, { ordina: columnId, verso: nextDirection })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  function toggleAllVisible(checked: boolean) {
    setSelection((current) => {
      const next = { ...current }
      for (const row of rows) {
        const id = getRowId(row)
        if (checked) next[id] = true
        else delete next[id]
      }
      return next
    })
  }

  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide() && column.id !== 'select')

  const etichetta = (column: Column<T, unknown>) =>
    typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id

  // L'ordinamento vive nell'intestazione della tabella, che su telefono non
  // c'è: senza questo comando l'elenco a schede resterebbe senza ordinamento.
  const sortableColumns = table
    .getAllLeafColumns()
    .filter((column) => column.columnDef.enableSorting !== false && column.id !== 'select')

  // Un solo menu di ordinamento, mostrato in due posti diversi: accanto ai
  // filtri sul telefono, da solo sulle larghezze intermedie. Da `md` in su
  // l'ordinamento torna dov'è naturale, nelle intestazioni della tabella.
  const ordinamento = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="w-full sm:w-auto">
          <ArrowUpDown aria-hidden="true" />
          Ordina
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Ordina per</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {sortableColumns.map((column) => {
          const active = sort === column.id
          return (
            <DropdownMenuItem key={column.id} onSelect={() => toggleSort(column.id)}>
              <span className="flex-1">{etichetta(column)}</span>
              {active ? (
                direction === 'asc' ? (
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                )
              ) : null}
              {active ? (
                <span className="sr-only">
                  {direction === 'asc' ? 'ordine crescente' : 'ordine decrescente'}
                </span>
              ) : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {ricerca}

          {/* Filtri e ordinamento sono i due comandi dell'elenco sul telefono:
              stanno sulla stessa riga, perché due righe di bottoni larghi
              quanto lo schermo rubano spazio proprio a ciò che si è venuti a
              leggere. */}
          <div className="flex items-center gap-2 sm:contents">
            {toolbar ? (
              <Button
                variant="secondary"
                size="sm"
                className="sm:hidden"
                onClick={() => setFiltriAperti((aperti) => !aperti)}
                aria-expanded={filtriAperti}
                aria-controls={idFiltri}
              >
                <SlidersHorizontal aria-hidden="true" />
                Filtri
                {filtriAttivi > 0 ? (
                  <span className="rounded-full bg-accent px-1.5 text-micro font-semibold text-accent-fg">
                    {filtriAttivi}
                  </span>
                ) : null}
              </Button>
            ) : null}
            <div className="sm:hidden">{ordinamento}</div>
          </div>

          {toolbar ? (
            <div
              id={idFiltri}
              className={cn(
                'flex-wrap items-center gap-2 sm:flex sm:flex-1',
                filtriAperti ? 'flex' : 'hidden',
              )}
            >
              {toolbar}
            </div>
          ) : null}
        </div>

        <div className="hidden sm:block md:hidden">{ordinamento}</div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="hidden md:inline-flex">
              <Columns3 aria-hidden="true" />
              Colonne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {hideableColumns.map((column) => {
              const label = etichetta(column)
              return (
                <label
                  key={column.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-small text-text transition-colors hover:bg-surface-hover"
                >
                  <Checkbox
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
                  />
                  {label}
                </label>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {bulkActions && selectedIds.length > 0 ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-border bg-accent-subtle px-3 py-2"
        >
          <span className="text-small font-medium text-accent-subtle-fg">
            <span className="num">{selectedIds.length}</span>{' '}
            {selectedIds.length === 1 ? 'riga selezionata' : 'righe selezionate'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selectedIds, () => setSelection({}))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelection({})} className="ml-auto">
            Annulla selezione
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        emptyState
      ) : (
        <>
          {/* Tabella: da tablet in su */}
          <TableWrapper className={cn('hidden md:block', pending && 'opacity-60 transition-opacity')}>
            <Table>
              <caption className="sr-only">{caption}</caption>
              <TableHead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {bulkActions ? (
                      <TableHeaderCell className="w-9">
                        <Checkbox
                          checked={
                            allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false
                          }
                          onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                          aria-label="Seleziona tutte le righe visibili"
                        />
                      </TableHeaderCell>
                    ) : null}
                    {headerGroup.headers.map((header) => {
                      // Il nome della colonna in chiaro, quando è una stringa:
                      // serve al bottone di ordinamento, che altrimenti si
                      // annuncia con il solo testo dell'intestazione e non
                      // dice che cosa fa — o, se l'intestazione è vuota, non
                      // si annuncia affatto.
                      const nomeColonna =
                        typeof header.column.columnDef.header === 'string'
                          ? header.column.columnDef.header
                          : ''
                      const sortable =
                        header.column.columnDef.enableSorting !== false && nomeColonna !== ''
                      const active = sort === header.column.id
                      const meta = header.column.columnDef.meta as
                        | { numeric?: boolean; width?: string }
                        | undefined
                      return (
                        <TableHeaderCell
                          key={header.id}
                          aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                          className={cn(meta?.numeric && 'text-right', meta?.width)}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(header.column.id)}
                              aria-label={`Ordina per ${nomeColonna}`}
                              className={cn(
                                // Il reset di Tailwind toglie ai bottoni il
                                // text-transform ereditato: senza "uppercase"
                                // le intestazioni ordinabili sarebbero scritte
                                // diversamente dalle altre.
                                'inline-flex items-center gap-1 rounded uppercase transition-colors hover:text-text',
                                active && 'text-text',
                              )}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {active ? (
                                direction === 'asc' ? (
                                  <ArrowUp className="size-3" aria-hidden="true" />
                                ) : (
                                  <ArrowDown className="size-3" aria-hidden="true" />
                                )
                              ) : (
                                <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHeaderCell>
                      )
                    })}
                  </tr>
                ))}
              </TableHead>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-riga="" data-selected={row.getIsSelected()}>
                    {bulkActions ? (
                      <TableCell className="w-9">
                        <Checkbox
                          checked={row.getIsSelected()}
                          onCheckedChange={(checked) => row.toggleSelected(checked === true)}
                          aria-label="Seleziona la riga"
                        />
                      </TableCell>
                    ) : null}
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as { numeric?: boolean } | undefined
                      return (
                        <TableCell
                          key={cell.id}
                          // Identifica la colonna a prescindere dalla sua
                          // posizione, che cambia con le colonne nascoste.
                          data-column={cell.column.id}
                          className={cn(meta?.numeric && 'text-right num')}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>

          {/* Schede: su telefono */}
          <ul className={cn('space-y-2 md:hidden', pending && 'opacity-60 transition-opacity')}>
            {rows.map((row) => (
              <li key={getRowId(row)} data-riga="">
                {renderCard(row)}
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-border bg-surface">
            <Pagination page={page} perPage={perPage} total={total} pageCount={pageCount} />
          </div>
        </>
      )}
    </div>
  )
}
