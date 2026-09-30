'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/server/session'

/**
 * Sospensione e riattivazione di un'agenzia.
 *
 * Il controllo vero è nel database: `suspend_agency` e `resume_agency`
 * rifiutano chi non amministra la piattaforma, e lo rifiuterebbero anche se
 * questo file non esistesse. Qui si controlla lo stesso, perché un errore
 * chiaro vale più di un'eccezione SQL tradotta male.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const sospensioneSchema = z.object({
  id: z.string().regex(UUID, 'Agenzia non valida'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Scrivi il motivo della sospensione: lo leggerà anche l’agenzia')
    .max(300),
})

function aggiorna() {
  revalidatePath('/piattaforma')
}

export async function sospendiAgenziaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isPlatformAdmin())) {
    return { status: 'error', message: 'Non hai i permessi per questa operazione.' }
  }

  const parsed = sospensioneSchema.safeParse({
    id: formData.get('id'),
    motivo: formData.get('motivo'),
  })
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Controlla i dati inseriti.',
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('suspend_agency', {
    p_agency_id: parsed.data.id,
    p_reason: parsed.data.motivo,
  })

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a sospendere l’agenzia.' }
  }

  aggiorna()
  return { status: 'success', message: 'Agenzia sospesa. Può ancora leggere e esportare i dati.' }
}

export async function riattivaAgenziaAction(agencyId: unknown): Promise<ActionState> {
  if (!(await isPlatformAdmin())) {
    return { status: 'error', message: 'Non hai i permessi per questa operazione.' }
  }
  if (typeof agencyId !== 'string' || !UUID.test(agencyId)) {
    return { status: 'error', message: 'Agenzia non valida.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('resume_agency', { p_agency_id: agencyId })

  if (error) {
    return { status: 'error', message: 'Non siamo riusciti a riattivare l’agenzia.' }
  }

  aggiorna()
  return { status: 'success', message: 'Agenzia riattivata.' }
}
