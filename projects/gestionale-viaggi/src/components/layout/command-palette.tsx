'use client'

import { Command } from 'cmdk'
import { Keyboard, LogOut, Monitor, Moon, Search, Sun } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { NAV_ITEMS, visibleNavItems } from '@/lib/navigation'
import type { Role } from '@/lib/roles'
import { applyTheme, type ThemePreference } from '@/lib/preferences'
import { signOutAction } from '@/server/actions/auth'
import { cn } from '@/lib/utils'

/**
 * Ricerca e comandi rapidi (Cmd/Ctrl + K).
 *
 * In questa fase il palinsesto contiene navigazione e comandi: la ricerca di
 * pratiche, clienti e preventivi si aggiunge qui quando i relativi moduli
 * esistono, per non offrire risultati che non portano da nessuna parte.
 */
export function CommandPalette({
  role,
  onOpenShortcuts,
}: {
  role: Role
  onOpenShortcuts: () => void
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const items = visibleNavItems(NAV_ITEMS, role)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = useCallback((action: () => void) => {
    setOpen(false)
    action()
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface-2 px-2.5 text-small text-text-subtle',
          'transition-colors duration-150 hover:border-border-strong hover:text-text-muted',
          'sm:w-72 sm:justify-between',
        )}
      >
        <span className="flex items-center gap-2">
          <Search className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Cerca o esegui un comando</span>
          <span className="sr-only sm:hidden">Apri la ricerca</span>
        </span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-[var(--animate-in-fade)]" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-e3 data-[state=open]:animate-[var(--animate-in-scale)]"
          >
            <DialogTitle className="sr-only">Ricerca e comandi</DialogTitle>
            <Command label="Ricerca e comandi" loop>
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                <Command.Input
                  placeholder="Cerca una sezione o digita un comando..."
                  className="h-11 w-full bg-transparent text-body text-text outline-none placeholder:text-text-subtle"
                />
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-6 text-center text-small text-text-muted">
                  Nessun risultato.
                </Command.Empty>

                <Command.Group
                  heading="Sezioni"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={`${item.label} ${item.description}`}
                      onSelect={() => run(() => router.push(item.href))}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                    >
                      <item.icon className="size-4 text-text-subtle" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <span className="hidden text-caption text-text-subtle sm:inline">{item.description}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Aspetto"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  <Command.Item
                    value="tema chiaro"
                    onSelect={() => run(() => applyTheme('light' satisfies ThemePreference))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                  >
                    <Sun className="size-4 text-text-subtle" aria-hidden="true" /> Tema chiaro
                  </Command.Item>
                  <Command.Item
                    value="tema scuro"
                    onSelect={() => run(() => applyTheme('dark' satisfies ThemePreference))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                  >
                    <Moon className="size-4 text-text-subtle" aria-hidden="true" /> Tema scuro
                  </Command.Item>
                  <Command.Item
                    value="tema di sistema"
                    onSelect={() => run(() => applyTheme('system' satisfies ThemePreference))}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                  >
                    <Monitor className="size-4 text-text-subtle" aria-hidden="true" /> Tema come il sistema
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading="Comandi"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-subtle"
                >
                  <Command.Item
                    value="scorciatoie da tastiera"
                    onSelect={() => run(onOpenShortcuts)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                  >
                    <Keyboard className="size-4 text-text-subtle" aria-hidden="true" /> Scorciatoie da tastiera
                  </Command.Item>
                  <Command.Item
                    value="esci disconnetti"
                    onSelect={() => run(() => void signOutAction())}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg"
                  >
                    <LogOut className="size-4 text-text-subtle" aria-hidden="true" /> Esci
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
