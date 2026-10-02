'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import type { ComponentProps } from 'react'
import { initials } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function Avatar({
  name,
  src,
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root> & { name: string; src?: string | null }) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-accent-subtle text-caption font-semibold text-accent-subtle-fg"
        delayMs={src ? 300 : 0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}
