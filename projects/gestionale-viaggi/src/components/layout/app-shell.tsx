import type { ReactNode } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { ROLE_LABELS } from '@/lib/roles'
import { requireSession } from '@/server/session'
import { readSidebarCollapsed, readTheme } from '@/server/preferences'

/** Impalcatura dell’applicazione: barra laterale, barra superiore, contenuto. */
export async function AppShell({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const [theme, collapsed] = await Promise.all([readTheme(), readSidebarCollapsed()])

  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar role={session.role} agencyName={session.agency.name} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          role={session.role}
          roleLabel={ROLE_LABELS[session.role]}
          fullName={session.membership.full_name}
          email={session.membership.email}
          agencyName={session.agency.name}
          theme={theme}
          canOpenSettings={session.permissions.settings}
        />
        <main id="contenuto" className="min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
