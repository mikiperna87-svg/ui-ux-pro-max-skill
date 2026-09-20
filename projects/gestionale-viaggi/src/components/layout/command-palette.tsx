'use client'

import { Command } from 'cmdk'
import {
  FileText,
  Keyboard,
  Receipt,
  LogOut,
  Luggage,
  Monitor,
  Moon,
  Search,
  Sun,
  Truck,
  Users,
  UsersRound,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { NAV_ITEMS, visibleNavItems } from '@/lib/navigation'
import type { Role } from '@/lib/roles'
import { applyTheme, type ThemePreference } from '@/lib/preferences'
import { signOutAction } from '@/server/actions/auth'
import { searchEverywhereAction, type SearchHit, type SearchResults } from '@/server/actions/ricerca'
import { cn } from '@/lib/utils'

const NESSUN_RISULTATO: SearchResults = {
  pratiche: [],
  preventivi: [],
  fatture: [],
  clienti: [],
  passeggeri: [],
  fornitori: [],
}

const GRUPPO =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-subtle'

const VOCE =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-small text-text data-[selected=true]:bg-accent-subtle data-[selected=true]:text-accent-subtle-fg'

/**
 * Ricerca e comandi rapidi (Cmd/Ctrl + K).
 *
 * Oltre a sezioni e comandi cerca in pratiche, preventivi e anagrafiche: chi
 * digita un cognome, una destinazione o una partita IVA arriva alla scheda
 * senza passare dagli elenchi. Un gruppo si aggiunge qui quando il modulo
 * esiste, per non offrire risultati che non portano da nessuna parte.
 */
export function CommandPalette({
  role,
  onOpenShortcuts,
}: {
  role: Role
  onOpenShortcuts: () => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchResults>(NESSUN_RISULTATO)
  const [searching, setSearching] = useState(false)
  const router = useRouter()
  const items = visibleNavItems(NAV_ITEMS, role)

  // La ricerca parte dopo una breve pausa: chi scrive "rossi" non deve
  // generare cinque interrogazioni al database.
  useEffect(() => {
    const cercato = term.trim()
    if (cercato.length < 2) {
      setHits(NESSUN_RISULTATO)
      setSearching(false)
      return
    }

    setSearching(true)
    let annullato = false
    const attesa = window.setTimeout(() => {
      searchEverywhereAction(cercato)
        .then((risultati) => {
          if (!annullato) setHits(risultati)
        })
        .catch(() => {
          if (!annullato) setHits(NESSUN_RISULTATO)
        })
        .finally(() => {
          if (!annullato) setSearching(false)
        })
    }, 200)

    return () => {
      annullato = true
      window.clearTimeout(attesa)
    }
  }, [term])

  // Chiudendo si riparte puliti: riaprire non deve mostrare la ricerca di ieri.
  useEffect(() => {
    if (!open) {
      setTerm('')
      setHits(NESSUN_RISULTATO)
    }
  }, [open])

  const gruppi: ReadonlyArray<{ titolo: string; icona: typeof Search; voci: readonly SearchHit[] }> = [
    { titolo: 'Pratiche', icona: Luggage, voci: hits.pratiche },
    { titolo: 'Preventivi', icona: FileText, voci: hits.preventivi },
    { titolo: 'Fatture', icona: Receipt, voci: hits.fatture },
    { titolo: 'Clienti', icona: Users, voci: hits.clienti },
    { titolo: 'Passeggeri', icona: UsersRound, voci: hits.passeggeri },
    { titolo: 'Fornitori', icona: Truck, voci: hits.fornitori },
  ]

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
                  value={term}
                  onValueChange={setTerm}
                  placeholder="Cerca una pratica, un cliente, un fornitore o un comando..."
                  className="h-11 w-full bg-transparent text-body text-text outline-none placeholder:text-text-subtle"
                />
                <Kbd>esc</Kbd>
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-6 text-center text-small text-text-muted">
                  {searching ? 'Ricerca in corso...' : 'Nessun risultato.'}
                </Command.Empty>

                {gruppi.map((gruppo) =>
                  gruppo.voci.length === 0 ? null : (
                    <Command.Group key={gruppo.titolo} heading={gruppo.titolo} className={GRUPPO}>
                      {gruppo.voci.map((voce) => (
                        <Command.Item
                          key={voce.href}
                          value={`${voce.label} ${voce.terms}`}
                          onSelect={() => run(() => router.push(voce.href))}
                          className={VOCE}
                        >
                          <gruppo.icona className="size-4 text-text-subtle" aria-hidden="true" />
                          <span className="flex-1 truncate">{voce.label}</span>
                          {voce.hint ? (
                            <span className="hidden max-w-56 truncate text-caption text-text-subtle sm:inline">
                              {voce.hint}
                            </span>
                          ) : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ),
                )}

                <Command.Group
                  heading="Sezioni"
                  className={GRUPPO}
                >
                  {items.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={`${item.label} ${item.description}`}
                      onSelect={() => run(() => router.push(item.href))}
                      className={VOCE}
                    >
                      <item.icon className="size-4 text-text-subtle" aria-hidden="true" />
                      <span className="flex-1">{item.label}</span>
                      <span className="hidden text-caption text-text-subtle sm:inline">{item.description}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Aspetto"
                  className={GRUPPO}
                >
                  <Command.Item
                    value="tema chiaro"
                    onSelect={() => run(() => applyTheme('light' satisfies ThemePreference))}
                    className={VOCE}
                  >
                    <Sun className="size-4 text-text-subtle" aria-hidden="true" /> Tema chiaro
                  </Command.Item>
                  <Command.Item
                    value="tema scuro"
                    onSelect={() => run(() => applyTheme('dark' satisfies ThemePreference))}
                    className={VOCE}
                  >
                    <Moon className="size-4 text-text-subtle" aria-hidden="true" /> Tema scuro
                  </Command.Item>
                  <Command.Item
                    value="tema di sistema"
                    onSelect={() => run(() => applyTheme('system' satisfies ThemePreference))}
                    className={VOCE}
                  >
                    <Monitor className="size-4 text-text-subtle" aria-hidden="true" /> Tema come il sistema
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading="Comandi"
                  className={GRUPPO}
                >
                  <Command.Item
                    value="scorciatoie da tastiera"
                    onSelect={() => run(onOpenShortcuts)}
                    className={VOCE}
                  >
                    <Keyboard className="size-4 text-text-subtle" aria-hidden="true" /> Scorciatoie da tastiera
                  </Command.Item>
                  <Command.Item
                    value="esci disconnetti"
                    onSelect={() => run(() => void signOutAction())}
                    className={VOCE}
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
