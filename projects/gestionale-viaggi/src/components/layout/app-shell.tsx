import { PauseCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { ROLE_LABELS } from '@/lib/roles'
import { isPlatformAdmin, requireSession } from '@/server/session'
import { readSidebarCollapsed, readTheme } from '@/server/preferences'

/** Impalcatura dell’applicazione: barra laterale, barra superiore, contenuto. */
export async function AppShell({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const [theme, collapsed, piattaforma] = await Promise.all([
    readTheme(),
    readSidebarCollapsed(),
    isPlatformAdmin(),
  ])

  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar
        role={session.role}
        piattaforma={piattaforma}
        agencyName={session.agency.name}
        defaultCollapsed={collapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={session.role}
          piattaforma={piattaforma}
          roleLabel={ROLE_LABELS[session.role]}
          fullName={session.membership.full_name}
          email={session.membership.email}
          agencyName={session.agency.name}
          theme={theme}
          canOpenSettings={session.permissions.settings}
        />
        {session.agency.suspended_at ? (
          // Chi viene sospeso deve leggerlo qui, non scoprirlo provando a
          // salvare. Il colore non basta da solo: c'è scritto che cosa è
          // successo e che cosa si può ancora fare.
          <div
            role="status"
            className="flex items-start gap-3 border-b border-warning-border bg-warning-subtle px-4 py-3 text-small text-warning-fg md:px-6"
          >
            <PauseCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0">
              <span className="font-semibold">Agenzia sospesa.</span> Puoi consultare ed
              esportare tutto quello che hai registrato, ma non inserire dati nuovi.
              {session.agency.suspension_reason ? ` Motivo: ${session.agency.suspension_reason}` : ''}
            </p>
          </div>
        ) : null}
        <main id="contenuto" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
