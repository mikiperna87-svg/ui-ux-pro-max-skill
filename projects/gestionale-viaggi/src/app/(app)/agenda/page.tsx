import {
  Banknote,
  CalendarCheck,
  CalendarClock,
  IdCard,
  ListTodo,
  Plane,
  Truck,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, formatDateShort, formatRelativeDays, toIsoDateOnly, todayInRome } from '@/lib/date'
import { TASK_PRIORITY, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { cn } from '@/lib/utils'
import {
  agendaItems,
  contoAttivita,
  listTasks,
  type AgendaItem,
  type TaskRow,
  type TipoAgenda,
} from '@/server/queries/agenda'
import { operatorOptions } from '@/server/queries/pratiche'
import { requireSession } from '@/server/session'
import { ETICHETTE_TIPO, FINESTRE, GIORNI_INDIETRO, finestraDa, linkAgenda, tipoDa } from './config'
import { NuovaAttivita } from './modulo-attivita'
import { AzioniAttivita } from './voce-attivita'

export const metadata: Metadata = { title: 'Agenda' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ICONE: Record<TipoAgenda, typeof ListTodo> = {
  attivita: ListTodo,
  incasso: Banknote,
  pagamento: Truck,
  partenza: Plane,
  documento: IdCard,
}

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireSession()
  const raw = await searchParams

  const finestra = finestraDa(raw.finestra)
  const tipo = tipoDa(raw.tipo)
  const soloMie = (Array.isArray(raw.chi) ? raw.chi[0] : raw.chi) === 'mie'
  const stato = { finestra: finestra.key, tipo, soloMie }

  const operatori = session.permissions.write ? await operatorOptions() : []

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Agenda"
        description="Che cosa c’è da fare: attività, scadenze di incasso e pagamento, partenze e documenti in scadenza. Chi è in ritardo compare per primo."
        actions={
          session.permissions.write ? (
            <NuovaAttivita operatori={operatori} defaultAssignee={session.membership.id} />
          ) : null
        }
      />

      <div className="space-y-3">
        <nav aria-label="Periodo" className="flex flex-wrap items-center gap-1.5">
          {FINESTRE.map((voce) => (
            <Link
              key={voce.key}
              href={linkAgenda(stato, { finestra: voce.key })}
              aria-current={voce.key === finestra.key ? 'true' : undefined}
              className={cn(
                'rounded-md border px-3 py-1.5 text-small transition-colors duration-150',
                voce.key === finestra.key
                  ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                  : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {voce.label}
            </Link>
          ))}

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />

          <Link
            href={linkAgenda(stato, { soloMie: !soloMie })}
            className={cn(
              'rounded-md border px-3 py-1.5 text-small transition-colors duration-150',
              soloMie
                ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
            )}
          >
            Solo le mie
          </Link>
        </nav>

        <nav aria-label="Tipo" className="flex flex-wrap items-center gap-1.5">
          <Link
            href={linkAgenda(stato, { tipo: null })}
            aria-current={tipo === null ? 'true' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-caption transition-colors duration-150',
              tipo === null
                ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
            )}
          >
            Tutto
          </Link>
          {(Object.keys(ETICHETTE_TIPO) as TipoAgenda[]).map((voce) => (
            <Link
              key={voce}
              href={linkAgenda(stato, { tipo: voce })}
              aria-current={tipo === voce ? 'true' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-caption transition-colors duration-150',
                tipo === voce
                  ? 'border-accent bg-accent-subtle font-medium text-accent-subtle-fg'
                  : 'border-border bg-surface text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              {ETICHETTE_TIPO[voce]}
            </Link>
          ))}
        </nav>
      </div>

      {/* Un solo confine Suspense, come nelle altre pagine: più confini
          fratelli mandano in stallo la transizione del router di Next 15
          (DECISIONI 35 e 41). */}
      <Suspense key={`${finestra.key}-${tipo ?? 'tutto'}-${soloMie}`} fallback={<Scheletro />}>
        <Corpo
          giorni={finestra.giorni}
          tipo={tipo}
          assegnatario={soloMie ? session.membership.id : null}
          operatori={operatori}
          puoScrivere={session.permissions.write}
        />
      </Suspense>
    </div>
  )
}

function Scheletro() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((indice) => (
          <Skeleton key={indice} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  )
}

async function Corpo({
  giorni,
  tipo,
  assegnatario,
  operatori,
  puoScrivere,
}: {
  giorni: number
  tipo: TipoAgenda | null
  assegnatario: string | null
  operatori: ReadonlyArray<{ id: string; label: string }>
  puoScrivere: boolean
}) {
  const oggi = todayInRome()
  const oggiIso = toIsoDateOnly(oggi)
  const da = toIsoDateOnly(addDays(oggi, -GIORNI_INDIETRO))
  const a = toIsoDateOnly(addDays(oggi, giorni))

  // Le attività si rileggono per intero perché i comandi della riga — modifica,
  // completa, elimina — lavorano su tutti i campi, e l'agenda ne porta solo il
  // necessario per essere mostrata.
  const [voci, conto, attivita] = await Promise.all([
    agendaItems(da, a, assegnatario),
    contoAttivita(oggiIso),
    puoScrivere ? listTasks({ stato: 'aperte', assegnatario }) : Promise.resolve([]),
  ])

  const attivitaPerId = new Map(attivita.map((task) => [task.id ?? '', task]))

  const filtrate = tipo ? voci.filter((voce) => voce.kind === tipo) : voci
  const inRitardo = filtrate.filter((voce) => voce.dueDate < oggiIso)
  const prossime = filtrate.filter((voce) => voce.dueDate >= oggiIso)

  const giorniRaggruppati = new Map<string, AgendaItem[]>()
  for (const voce of prossime) {
    const gruppo = giorniRaggruppati.get(voce.dueDate) ?? []
    gruppo.push(voce)
    giorniRaggruppati.set(voce.dueDate, gruppo)
  }

  return (
    <div className="space-y-5">
      <section aria-label="Attività" className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Attività aperte"
          value={String(conto.aperte)}
          hint={plurale(conto.oggi, 'in scadenza oggi', 'in scadenza oggi')}
          icon={<ListTodo />}
        />
        <KpiCard
          label="In ritardo"
          value={String(conto.inRitardo)}
          hint={conto.inRitardo === 0 ? 'Nessuna attività scaduta' : 'Attività oltre la scadenza'}
          icon={<CalendarClock />}
          tone={conto.inRitardo > 0 ? 'critical' : 'default'}
        />
        <KpiCard
          label="In agenda"
          value={String(filtrate.length)}
          hint="Voci nel periodo scelto, ritardi compresi"
          icon={<CalendarCheck />}
        />
      </section>

      {filtrate.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title="Niente in agenda"
          description="Nessuna scadenza né attività nel periodo scelto. Allarga il periodo, oppure aggiungi un’attività per non dimenticare una cosa da fare."
        />
      ) : (
        <div className="space-y-5">
          {inRitardo.length > 0 ? (
            <Gruppo
              titolo="In ritardo"
              sottotitolo={`${inRitardo.length} ${inRitardo.length === 1 ? 'voce arretrata' : 'voci arretrate'}`}
              voci={inRitardo}
              attivita={attivitaPerId}
              operatori={operatori}
              allarme
            />
          ) : null}

          {[...giorniRaggruppati.entries()].map(([giorno, vociDelGiorno]) => (
            <Gruppo
              key={giorno}
              titolo={formatDateShort(giorno)}
              sottotitolo={formatRelativeDays(giorno)}
              voci={vociDelGiorno}
              attivita={attivitaPerId}
              operatori={operatori}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Gruppo({
  titolo,
  sottotitolo,
  voci,
  attivita,
  operatori,
  allarme = false,
}: {
  titolo: string
  sottotitolo: string
  voci: readonly AgendaItem[]
  attivita: ReadonlyMap<string, TaskRow>
  operatori: ReadonlyArray<{ id: string; label: string }>
  allarme?: boolean
}) {
  return (
    <section aria-label={titolo}>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className={cn('text-heading', allarme ? 'text-danger' : 'text-text')}>{titolo}</h2>
        <p className="text-caption text-text-muted">{sottotitolo}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {voci.map((voce) => (
              <Voce
                key={`${voce.kind}-${voce.id}`}
                voce={voce}
                task={attivita.get(voce.id) ?? null}
                operatori={operatori}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}

function Voce({
  voce,
  task,
  operatori,
}: {
  voce: AgendaItem
  task: TaskRow | null
  operatori: ReadonlyArray<{ id: string; label: string }>
}) {
  const Icona = ICONE[voce.kind]
  const collegamento =
    voce.kind === 'documento'
      ? voce.entityId
        ? `/passeggeri/${voce.entityId}`
        : null
      : voce.bookingId
        ? `/pratiche/${voce.bookingId}`
        : null

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-3">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
          voce.isOverdue ? 'bg-danger-subtle text-danger-fg' : 'bg-surface-2 text-text-subtle',
        )}
        aria-hidden="true"
      >
        <Icona />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {collegamento ? (
            <Link
              href={collegamento}
              className="truncate font-medium text-text underline-offset-2 hover:text-accent hover:underline"
            >
              {voce.title}
            </Link>
          ) : (
            <p className="truncate font-medium text-text">{voce.title}</p>
          )}
          <Badge tone="neutral">{ETICHETTE_TIPO[voce.kind]}</Badge>
          {voce.taskPriority && voce.taskPriority !== 'media' ? (
            <Badge tone={TASK_PRIORITY[voce.taskPriority].tone}>
              {TASK_PRIORITY[voce.taskPriority].label}
            </Badge>
          ) : null}
          {voce.isOverdue ? <Badge tone="danger">In ritardo</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-caption text-text-muted">
          {[voce.detail, voce.assigneeName].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {voce.amountCents > 0 ? (
          <span className="num text-small font-medium text-text">
            {formatEuro(voce.amountCents)}
          </span>
        ) : null}
        {voce.kind === 'attivita' && task ? (
          <AzioniAttivita task={task} operatori={operatori} />
        ) : null}
      </div>
    </li>
  )
}
