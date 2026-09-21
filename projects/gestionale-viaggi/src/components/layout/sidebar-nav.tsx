'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StatoNavigazione } from '@/components/layout/stato-navigazione'
import { NAV_ITEMS, visibleNavItems } from '@/lib/navigation'
import type { Role } from '@/lib/roles'
import { cn } from '@/lib/utils'

export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: Role
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const items = visibleNavItems(NAV_ITEMS, role)

  return (
    <nav aria-label="Navigazione principale" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small font-medium',
              'transition-colors duration-150 ease-[var(--ease-out-soft)]',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-accent-subtle text-accent-subtle-fg'
                : 'text-text-muted hover:bg-surface-hover hover:text-text',
            )}
          >
            <item.icon
              className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-text-subtle group-hover:text-text-muted')}
              aria-hidden="true"
            />
            {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
            <StatoNavigazione className={collapsed ? 'absolute right-1 top-1' : undefined} />
          </Link>
        )
      })}
    </nav>
  )
}
