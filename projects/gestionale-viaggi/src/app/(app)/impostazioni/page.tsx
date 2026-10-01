import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/dashboard/page-header'
import { RiapriPrimiPassi } from '@/components/dashboard/primi-passi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/server'
import { listEmailMessages, statoPosta } from '@/server/queries/email'
import { requireSession } from '@/server/session'
import { AbbonamentoPanel } from './abbonamento-panel'
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
  const [{ data: abbonamento }, { data: piani }] = await Promise.all([
    supabase.from('subscriptions').select('*').eq('agency_id', session.agency.id).maybeSingle(),
    supabase.from('plans').select('*'),
  ])
  const piano = abbonamento ? (piani ?? []).find((p) => p.code === abbonamento.plan_code) ?? null : null

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
          <TabsTrigger value="abbonamento">Abbonamento</TabsTrigger>
        </TabsList>

        <TabsContent value="abbonamento">
          <AbbonamentoPanel abbonamento={abbonamento} piano={piano} />
        </TabsContent>

        <TabsContent value="agenzia">
          <AgenziaForm agency={session.agency} />
        </TabsContent>

        <TabsContent value="utenti">
          <UtentiPanel members={members ?? []} currentMembershipId={session.membership.id} />
        </TabsContent>

        <TabsContent value="parametri">
          <div className="space-y-4">
            <ParametriForm settings={session.settings} />

            {/* Nascondere i primi passi non è una via senza ritorno: chi li ha
                chiusi e vuole finire il percorso li ritrova qui. */}
            {session.settings.onboarding_dismissed_at ? (
              <Card>
                <CardHeader>
                  <div className="space-y-1">
                    <CardTitle>Primi passi</CardTitle>
                    <p className="text-small text-text-muted">
                      Il percorso del primo giorno è nascosto dalla panoramica. Rimettilo per
                      vedere che cosa resta da configurare.
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <RiapriPrimiPassi />
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="posta">
          <PostaPanel settings={session.settings} stato={stato} messaggi={messaggi} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
