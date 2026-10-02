'use client'

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tone: ToastTone
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

interface ToastContextValue {
  readonly show: (toast: Omit<Toast, 'id'>) => void
  readonly success: (title: string, description?: string) => void
  readonly error: (title: string, description?: string) => void
  readonly dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 5_000

const toneStyles: Record<ToastTone, { icon: ReactNode; accent: string }> = {
  success: { icon: <CircleCheck className="size-4 text-success" aria-hidden="true" />, accent: 'border-l-success' },
  error: { icon: <CircleAlert className="size-4 text-danger" aria-hidden="true" />, accent: 'border-l-danger' },
  info: { icon: <Info className="size-4 text-info" aria-hidden="true" />, accent: 'border-l-info' },
}

/**
 * Notifiche discrete: compaiono in basso a destra, non bloccano nulla e
 * spariscono da sole. Gli errori restano finche non li si chiude.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = crypto.randomUUID()
      setToasts((current) => [...current.slice(-3), { ...toast, id }])
      if (toast.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), DURATION_MS),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ title, tone: 'success', ...(description ? { description } : {}) }),
      error: (title, description) => show({ title, tone: 'error', ...(description ? { description } : {}) }),
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifiche"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border border-l-2 border-border bg-surface p-3 shadow-e3',
              'animate-[var(--animate-in-slide)]',
              toneStyles[toast.tone].accent,
            )}
          >
            <span className="mt-0.5 shrink-0">{toneStyles[toast.tone].icon}</span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-small font-medium text-text">{toast.title}</p>
              {toast.description ? (
                <p className="text-caption text-text-muted break-words">{toast.description}</p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="mt-1 text-caption font-medium text-accent underline-offset-2 hover:underline"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-0.5 text-text-subtle transition-colors hover:text-text"
            >
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Chiudi notifica</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast va usato dentro <ToastProvider>')
  return context
}
