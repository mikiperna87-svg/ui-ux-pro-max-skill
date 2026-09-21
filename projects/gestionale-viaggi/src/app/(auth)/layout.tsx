import { Plane } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(26rem,32rem)]">
      {/* Colonna narrativa: presente solo dove c’e' spazio per esserlo davvero */}
      {/* Superficie sempre scura in entrambi i temi: il testo bianco che porta
          non deve mai finire su un fondo chiaro. Per questo usa le primitive
          del marchio e non i token semantici, che cambiano con il tema. */}
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-[var(--brand-950)] lg:block"
      >
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_10%,var(--brand-800),transparent_62%),radial-gradient(90%_80%_at_85%_90%,var(--brand-700),transparent_55%)] opacity-95" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <span className="flex items-center gap-2 text-small font-semibold text-white/90">
            <span className="grid size-7 place-items-center rounded-md bg-white/15">
              <Plane className="size-4" />
            </span>
            Gestionale Viaggi
          </span>
          <div className="max-w-md space-y-3">
            <p className="text-hero text-white">
              Ogni pratica, dal preventivo al saldo, in un unico posto.
            </p>
            <p className="text-body text-white/70">
              Margini calcolati in tempo reale, scadenze fornitore sotto controllo, documenti dei
              passeggeri sempre in regola.
            </p>
          </div>
          <p className="text-caption text-white/50">
            Dati isolati per agenzia · Registro attività immutabile
          </p>
        </div>
      </section>

      <main
        id="contenuto"
        className="flex items-center justify-center bg-bg px-4 py-10 sm:px-8"
      >
        <div className="w-full max-w-sm">
          <Link
            href="/accedi"
            className="mb-8 flex items-center gap-2 text-small font-semibold text-text lg:hidden"
          >
            <span className="grid size-7 place-items-center rounded-md bg-accent text-accent-fg">
              <Plane className="size-4" aria-hidden="true" />
            </span>
            Gestionale Viaggi
          </Link>
          {children}
        </div>
      </main>
    </div>
  )
}
