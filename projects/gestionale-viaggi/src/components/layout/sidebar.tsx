'use client'

import { PanelLeftClose, PanelLeftOpen, Plane } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { Button } from '@/components/ui/button'
import type { Role } from '@/lib/roles'
import { persistSidebarCollapsed } from '@/lib/preferences'
import { cn } from '@/lib/utils'

export function Sidebar({
  role,
  agencyName,
  defaultCollapsed,
}: {
  role: Role
  agencyName: string
  defaultCollapsed: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    persistSidebarCollapsed(next)
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'hidden shrink-0 flex-col border-r border-border bg-surface md:flex',
        'transition-[width] duration-200 ease-[var(--ease-out-soft)]',
        collapsed ? 'w-(--container-sidebar-collapsed)' : 'w-(--container-sidebar)',
      )}
    >
      <div
        className={cn(
          'flex h-(--container-topbar) items-center gap-2 border-b border-border px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
            <Plane className="size-4" aria-hidden="true" />
          </span>
          {collapsed ? null : (
            <span className="truncate text-small font-semibold text-text">{agencyName}</span>
          )}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <SidebarNav role={role} collapsed={collapsed} />
      </div>

      <div className={cn('border-t border-border p-2', collapsed && 'flex justify-center')}>
        <Button
          variant="ghost"
          size={collapsed ? 'icon-sm' : 'sm'}
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Espandi la barra laterale' : 'Comprimi la barra laterale'}
          className={collapsed ? undefined : 'w-full justify-start'}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden="true" />
              Comprimi
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
