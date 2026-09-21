import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/server'
import { listEmailMessages, statoPosta } from '@/server/queries/email'
import { requireSession } from '@/server/session'
import { AgenziaForm } from './agenzia-form'
import { ParametriForm } from './parametri-form'
import { PostaPanel } from './posta-panel'
import { UtentiPanel } from './utenti-panel'

export const metadata: Metadata = { title: 'Impostazioni' }

export default async function ImpostazioniPage() {
  const session = await requireSession()

  // Le impostazioni sono riservate al titolare: la RLS lo impedirebbè comunque,
  // ma una pagina che non si può usare non deve nemmeno comparire.
  if (!session.permissions.settings) notFound()

  const supabase = await createClient()
  const [{ data: members }, stato, messaggi] = await Promise.all([
    supabase
      .from('memberships')
      .select('*')
      .eq('agency_id', session.agency.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    statoPosta(session.settings.email_enabled),
    listEmailMessages(25),
  ])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Impostazioni"
        description="Dati fiscali dell’agenzia, persone che ci lavorano e parametri che guidano le scadenze."
      />

      <Tabs defaultValue="agenzia">
        <TabsList>
          <TabsTrigger value="agenzia">Agenzia</TabsTrigger>
          <TabsTrigger value="utenti">Utenti e ruoli</TabsTrigger>
          <TabsTrigger value="parametri">Parametri</TabsTrigger>
          <TabsTrigger value="posta">Posta</TabsTrigger>
        </TabsList>

        <TabsContent value="agenzia">
          <AgenziaForm agency={session.agency} />
        </TabsContent>

        <TabsContent value="utenti">
          <UtentiPanel members={members ?? []} currentMembershipId={session.membership.id} />
        </TabsContent>

        <TabsContent value="parametri">
          <ParametriForm settings={session.settings} />
        </TabsContent>

        <TabsContent value="posta">
          <PostaPanel settings={session.settings} stato={stato} messaggi={messaggi} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
