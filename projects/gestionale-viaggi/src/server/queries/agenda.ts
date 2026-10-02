import 'server-only'

import { toCents } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import type { Enums, Views } from '@/lib/database.types'

export type TaskRow = Views<'task_list'>

/** Le cinque cose che possono comparire in agenda. */
export const TIPI_AGENDA = ['attivita', 'incasso', 'pagamento', 'partenza', 'documento'] as const
export type TipoAgenda = (typeof TIPI_AGENDA)[number]

export function isTipoAgenda(value: unknown): value is TipoAgenda {
  return typeof value === 'string' && (TIPI_AGENDA as readonly string[]).includes(value)
}

export interface AgendaItem {
  readonly kind: TipoAgenda
  readonly id: string
  readonly dueDate: string
  readonly title: string
  readonly detail: string
  readonly amountCents: number
  readonly bookingId: string | null
  readonly bookingCode: string | null
  readonly entityId: string | null
  readonly taskStatus: Enums['task_status'] | null
  readonly taskPriority: Enums['task_priority'] | null
  readonly assigneeId: string | null
  readonly assigneeName: string | null
  readonly isOverdue: boolean
}

/**
 * L'agenda fra due date.
 *
 * Cinque sorgenti diverse arrivano già unite dal database: metterle insieme
 * qui avrebbe voluto dire cinque viaggi di rete e un ordinamento fatto in
 * JavaScript su dati che il database sa ordinare meglio.
 */
export async function agendaItems(
  from: string,
  to: string,
  assigneeId?: string | null,
): Promise<readonly AgendaItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('agenda', {
    p_from: from,
    p_to: to,
    p_assignee_id: assigneeId ?? null,
  })

  if (error) throw new Error(`Agenda non disponibile: ${error.message}`)

  return ((data as unknown as readonly Record<string, unknown>[] | null) ?? [])
    .filter((row): row is Record<string, unknown> => isTipoAgenda(row.item_kind))
    .map((row) => ({
      kind: row.item_kind as TipoAgenda,
      id: String(row.item_id),
      dueDate: String(row.due_date),
      title: String(row.title ?? ''),
      detail: String(row.detail ?? ''),
      amountCents: toCents(row.amount_cents, 'importo'),
      bookingId: row.booking_id ? String(row.booking_id) : null,
      bookingCode: row.booking_code ? String(row.booking_code) : null,
      entityId: row.entity_id ? String(row.entity_id) : null,
      taskStatus: (row.task_status as Enums['task_status'] | null) ?? null,
      taskPriority: (row.task_priority as Enums['task_priority'] | null) ?? null,
      assigneeId: row.assignee_id ? String(row.assignee_id) : null,
      assigneeName: row.assignee_name ? String(row.assignee_name) : null,
      isOverdue: row.is_overdue === true,
    }))
}

export interface FiltriAttivita {
  readonly stato?: 'aperte' | 'completate' | 'tutte'
  readonly assegnatario?: string | null
  readonly bookingId?: string | null
  readonly limite?: number
}

/**
 * Le attività, con il loro contesto già risolto.
 *
 * "Aperte" comprende anche quelle in corso: chi guarda l'elenco vuole sapere
 * che cosa resta da fare, e un'attività iniziata resta da finire.
 */
export async function listTasks(filtri: FiltriAttivita = {}): Promise<readonly TaskRow[]> {
  const supabase = await createClient()
  let query = supabase.from('task_list').select('*')

  const stato = filtri.stato ?? 'aperte'
  if (stato === 'aperte') query = query.in('status', ['aperto', 'in_corso'])
  if (stato === 'completate') query = query.eq('status', 'completato')

  if (filtri.assegnatario) query = query.eq('assignee_id', filtri.assegnatario)
  if (filtri.bookingId) query = query.eq('booking_id', filtri.bookingId)

  // Le attività senza scadenza vanno in fondo: non sono in ritardo, aspettano.
  const { data, error } = await query
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(filtri.limite ?? 200)

  if (error) throw new Error(`Attività non disponibili: ${error.message}`)
  return data ?? []
}

export async function getTask(id: string): Promise<TaskRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('task_list').select('*').eq('id', id).maybeSingle()
  return data ?? null
}

export interface ContoAttivita {
  readonly aperte: number
  readonly inRitardo: number
  readonly oggi: number
}

/** I numeri in cima all'agenda: aperte, in ritardo, in scadenza oggi. */
export async function contoAttivita(oggi: string): Promise<ContoAttivita> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('task_list')
    .select('status, is_overdue, due_date')
    .in('status', ['aperto', 'in_corso'])
    .limit(1000)

  const righe = data ?? []
  return {
    aperte: righe.length,
    inRitardo: righe.filter((riga) => riga.is_overdue === true).length,
    oggi: righe.filter((riga) => riga.due_date === oggi).length,
  }
}
