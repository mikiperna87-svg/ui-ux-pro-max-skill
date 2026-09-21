'use client'

import { ListTodo } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateTime, formatRelativeDays } from '@/lib/date'
import { TASK_PRIORITY, TASK_STATUS } from '@/lib/labels'
import { NuovaAttivita } from '@/app/(app)/agenda/modulo-attivita'
import { AzioniAttivita } from '@/app/(app)/agenda/voce-attivita'
import type { TaskRow } from '@/server/queries/agenda'

/**
 * Le attività della pratica.
 *
 * Sono le stesse dell'agenda — stessa tabella, stesso modulo, stessi comandi —
 * viste dal lato della pratica: qui nascono con la pratica già collegata, così
 * chi le legge in agenda sa a quale viaggio appartengono.
 */
export function AttivitaPratica({
  bookingId,
  customerId,
  tasks,
  operatori,
  canWrite,
}: {
  bookingId: string
  customerId: string
  tasks: readonly TaskRow[]
  operatori: ReadonlyArray<{ id: string; label: string }>
  canWrite: boolean
}) {
  const aperte = tasks.filter((task) => task.status === 'aperto' || task.status === 'in_corso')
  const chiuse = tasks.filter((task) => task.status !== 'aperto' && task.status !== 'in_corso')
  const comando = canWrite ? (
    <NuovaAttivita
      operatori={operatori}
      bookingId={bookingId}
      customerId={customerId}
      etichetta="Nuova attività"
      variante="secondary"
    />
  ) : null

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <CardTitle>Cose da fare su questa pratica</CardTitle>
          {tasks.length > 0 ? comando : null}
        </div>
      </CardHeader>

      <CardContent className={tasks.length === 0 ? undefined : 'p-0'}>
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ListTodo />}
            title="Nessuna attività su questa pratica"
            description="Le verifiche create alla conferma compaiono qui. Puoi aggiungerne altre: un richiamo al cliente, un documento da chiedere."
            action={comando ?? undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {[...aperte, ...chiuse].map((task) => {
              const completata = task.status !== 'aperto' && task.status !== 'in_corso'
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={
                          completata
                            ? 'truncate text-small text-text-muted line-through'
                            : 'truncate text-small font-medium text-text'
                        }
                      >
                        {task.title}
                      </p>
                      {task.priority && task.priority !== 'media' && !completata ? (
                        <Badge tone={TASK_PRIORITY[task.priority].tone}>
                          {TASK_PRIORITY[task.priority].label}
                        </Badge>
                      ) : null}
                      {task.is_overdue ? <Badge tone="danger">In ritardo</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-caption text-text-muted">
                      {task.due_at
                        ? `Entro il ${formatDateTime(task.due_at)} · ${formatRelativeDays(task.due_at)}`
                        : 'Senza scadenza'}
                      {task.assignee_name ? ` · ${task.assignee_name}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {task.status ? (
                      <Badge tone={TASK_STATUS[task.status].tone}>
                        {TASK_STATUS[task.status].label}
                      </Badge>
                    ) : null}
                    {canWrite ? (
                      <AzioniAttivita task={task} operatori={operatori} completata={completata} />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
