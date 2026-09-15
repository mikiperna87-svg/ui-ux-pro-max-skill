'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

type TabsVariant = 'underline' | 'segmented'

export function TabsList({
  className,
  variant = 'underline',
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        'flex items-center',
        variant === 'underline'
          ? 'gap-1 overflow-x-auto border-b border-border'
          : 'gap-1 rounded-lg bg-surface-2 p-1',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  variant = 'underline',
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'whitespace-nowrap text-small font-medium text-text-muted transition-colors duration-150 hover:text-text',
        variant === 'underline'
          ? 'relative -mb-px border-b-2 border-transparent px-3 py-2 data-[state=active]:border-accent data-[state=active]:text-text'
          : 'flex-1 rounded-md px-3 py-1.5 data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-e1',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />
}
