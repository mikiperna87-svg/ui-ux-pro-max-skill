'use client'

import { LogOut, ShieldCheck, UserRound } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { signOutAction, signOutEverywhereAction } from '@/server/actions/auth'

export function UserMenu({
  fullName,
  email,
  roleLabel,
  canOpenSettings,
}: {
  fullName: string
  email: string
  roleLabel: string
  canOpenSettings: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={`Profilo di ${fullName}`}>
          <Avatar name={fullName} className="size-7" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Avatar name={fullName} />
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-text">{fullName}</p>
            <p className="truncate text-caption text-text-muted">{email}</p>
          </div>
        </div>
        <div className="px-2 pb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-2 py-0.5 text-caption font-medium text-accent-subtle-fg">
            <ShieldCheck className="size-3" aria-hidden="true" />
            {roleLabel}
          </span>
        </div>
        <DropdownMenuSeparator />
        {canOpenSettings ? (
          <DropdownMenuItem asChild>
            <Link href="/impostazioni">
              <UserRound aria-hidden="true" />
              Impostazioni agenzia
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOut aria-hidden="true" />
          Esci
        </DropdownMenuItem>
        <DropdownMenuItem variant="danger" onSelect={() => void signOutEverywhereAction()}>
          <LogOut aria-hidden="true" />
          Esci da tutti i dispositivi
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
