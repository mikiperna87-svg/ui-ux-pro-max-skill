'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { applyTheme, type ThemePreference } from '@/lib/preferences'

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Chiaro', icon: Sun },
  { value: 'dark', label: 'Scuro', icon: Moon },
  { value: 'system', label: 'Come il sistema', icon: Monitor },
]

export function ThemeToggle({ current }: { current: ThemePreference }) {
  const [selected, setSelected] = useState<ThemePreference>(current)

  function scegli(theme: ThemePreference) {
    setSelected(theme)
    applyTheme(theme)
  }

  const Icon = OPTIONS.find((option) => option.value === selected)?.icon ?? Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Cambia tema">
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Aspetto</DropdownMenuLabel>
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => scegli(option.value)}
            aria-current={selected === option.value}
            className={selected === option.value ? 'bg-accent-subtle text-accent-subtle-fg' : undefined}
          >
            <option.icon aria-hidden="true" />
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
