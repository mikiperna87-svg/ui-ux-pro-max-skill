import { CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Messaggio di esito del form: sempre testuale, mai solo un colore. */
export function FormMessage({
  status,
  message,
  className,
}: {
  status: 'idle' | 'error' | 'success'
  message?: string
  className?: string
}) {
  if (status === 'idle' || !message) return null

  const isError = status === 'error'

  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-small',
        isError
          ? 'border-danger-subtle bg-danger-subtle/50 text-danger-fg'
          : 'border-success-subtle bg-success-subtle/50 text-success-fg',
        className,
      )}
    >
      {isError ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
    </p>
  )
}
