import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-soft)]',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:translate-y-px',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg shadow-e1 hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border border-border bg-surface text-text shadow-e1 hover:bg-surface-hover active:bg-surface-active',
        ghost: 'text-text-muted hover:bg-surface-hover hover:text-text',
        subtle: 'bg-accent-subtle text-accent-subtle-fg hover:brightness-[0.97]',
        danger: 'bg-danger text-danger-contrast shadow-e1 hover:brightness-110 active:brightness-95',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-2.5 text-caption',
        md: 'h-9 px-3.5 text-small',
        lg: 'h-10 px-5 text-body',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  /** Rende il figlio l’elemento cliccabile (es. un Link) mantenendo lo stile. */
  asChild?: boolean
}

export function Button({ className, variant, size, block, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
