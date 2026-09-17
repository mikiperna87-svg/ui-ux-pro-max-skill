'use client'

import { HelpCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CommandPalette } from '@/components/layout/command-palette'
import { MobileNav } from '@/components/layout/mobile-nav'
import { ShortcutsDialog } from '@/components/layout/shortcuts-dialog'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS, visibleNavItems } from '@/lib/navigation'
import type { Role } from '@/lib/roles'
import type { ThemePreference } from '@/lib/preferences'

export function Topbar({
  role,
  roleLabel,
  fullName,
  email,
  agencyName,
  theme,
  canOpenSettings,
}: {
  role: Role
  roleLabel: string
  fullName: string
  email: string
  agencyName: string
  theme: ThemePreference
  canOpenSettings: boolean
}) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const router = useRouter()
  const pendingGo = useRef(false)

  // Le stesse voci della barra laterale: una scorciatoia non porta mai dove
  // l'utente non potrebbe comunque andare.
  const sezioni = useMemo(() => visibleNavItems(NAV_ITEMS, role), [role])

  /** Scorciatoie globali: ⌘/ per l’aiuto, "g" seguito da una lettera per navigare. */
  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      return (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )
    }

    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target)) return

      if (event.key === '/' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }

      if (event.key.toLowerCase() === 'g' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        pendingGo.current = true
        window.setTimeout(() => {
          pendingGo.current = false
        }, 1200)
        return
      }

      if (pendingGo.current) {
        pendingGo.current = false
        const tasto = event.key.toLowerCase()
        const destinazione = sezioni.find((item) => item.shortcut === tasto)
        if (destinazione) router.push(destinazione.href)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [router, sezioni])

  return (
    <header className="sticky top-0 z-30 flex h-(--container-topbar) shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur">
      <MobileNav role={role} agencyName={agencyName} />

      <div className="flex-1">
        <CommandPalette role={role} onOpenShortcuts={() => setShortcutsOpen(true)} />
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setShortcutsOpen(true)}
        aria-label="Scorciatoie da tastiera"
      >
        <HelpCircle className="size-4" aria-hidden="true" />
      </Button>

      <ThemeToggle current={theme} />

      <UserMenu
        fullName={fullName}
        email={email}
        roleLabel={roleLabel}
        canOpenSettings={canOpenSettings}
      />

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} sezioni={sezioni} />
    </header>
  )
}
