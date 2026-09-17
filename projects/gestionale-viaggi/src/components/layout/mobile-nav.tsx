'use client'

import { Menu, Plane } from 'lucide-react'
import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { Button } from '@/components/ui/button'
import { DialogTitle } from '@/components/ui/dialog'
import type { Role } from '@/lib/roles'

/** Su schermo stretto la barra laterale diventa un pannello a scomparsa. */
export function MobileNav({ role, agencyName }: { role: Role; agencyName: string }) {
  const [open, setOpen] = useState(false)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Apri il menu">
          <Menu className="size-4" aria-hidden="true" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-[var(--animate-in-fade)] md:hidden" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface shadow-e3 data-[state=open]:animate-[var(--animate-in-fade)] md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-(--container-topbar) items-center gap-2 border-b border-border px-3">
            <span className="grid size-7 place-items-center rounded-md bg-accent text-accent-fg">
              <Plane className="size-4" aria-hidden="true" />
            </span>
            <DialogTitle className="truncate text-small font-semibold">{agencyName}</DialogTitle>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <SidebarNav role={role} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border p-2">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                Chiudi
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
