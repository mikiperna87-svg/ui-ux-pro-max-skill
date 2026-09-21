'use client'

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DropdownPrimitive.Root
export const DropdownMenuTrigger = DropdownPrimitive.Trigger
export const DropdownMenuGroup = DropdownPrimitive.Group

/**
 * Il corpo di un menu a tendina.
 *
 * L'altezza è limitata a quanto resta di schermo e il contenuto scorre: un
 * menu che cresce con i dati — le viste salvate, per dire — arrivava a
 * superare l'altezza della finestra, e le voci in fondo restavano fuori,
 * impossibili da toccare e impossibili da raggiungere scorrendo, perché il
 * menu non scorreva. L'altezza massima è quella che Radix calcola per la
 * posizione scelta, e `collisionPadding` le lascia otto pixel di margine dal
 * bordo della finestra.
 */
export function DropdownMenuContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-50 min-w-48 rounded-lg border border-border bg-surface p-1 shadow-e3',
          'max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto',
          'data-[state=open]:animate-[var(--animate-in-scale)]',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof DropdownPrimitive.Item> & { variant?: 'default' | 'danger' }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-small outline-none',
        'transition-colors duration-150',
        'data-[highlighted]:bg-accent-subtle data-[highlighted]:text-accent-subtle-fg',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-subtle",
        variant === 'danger'
          ? 'text-danger data-[highlighted]:bg-danger-subtle [&_svg]:text-danger'
          : 'text-text',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn('px-2 py-1.5 text-caption font-semibold uppercase tracking-wide text-text-subtle', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}
