import 'server-only'

import { emailConfig } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'

export type EmailRow = Tables<'email_messages'>

export interface StatoPosta {
  /** Vero quando esistono chiave e mittente: senza, i messaggi restano in coda. */
  readonly configurata: boolean
  readonly mittente: string | null
  readonly abilitata: boolean
  readonly inCoda: number
  readonly errori: number
  readonly inviate: number
}

/**
 * Lo stato della posta, come lo legge chi apre le impostazioni.
 *
 * La chiave non compare mai: si dice soltanto se c'è, e qual è il mittente che
 * il cliente vedrà. Un segreto mostrato "solo agli amministratori" è comunque
 * un segreto in una pagina HTML.
 */
export async function statoPosta(abilitata: boolean): Promise<StatoPosta> {
  const supabase = await createClient()
  const config = emailConfig()

  const [inCoda, errori, inviate] = await Promise.all([
    conta('in_coda'),
    conta('errore'),
    conta('inviata'),
  ])

  async function conta(stato: EmailRow['status']): Promise<number> {
    const { count } = await supabase
      .from('email_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', stato)
      .is('deleted_at', null)
    return count ?? 0
  }

  return {
    configurata: config !== null,
    mittente: config?.from ?? null,
    abilitata,
    inCoda,
    errori,
    inviate,
  }
}

export async function listEmailMessages(limite = 50): Promise<readonly EmailRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(`Coda della posta non disponibile: ${error.message}`)
  return data ?? []
}

/** I messaggi legati a un documento: la prova di che cosa ha ricevuto il cliente. */
export async function emailsForQuote(quoteId: string): Promise<readonly EmailRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_messages')
    .select('*')
    .eq('quote_id', quoteId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function emailsForInvoice(invoiceId: string): Promise<readonly EmailRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_messages')
    .select('*')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  return data ?? []
}
