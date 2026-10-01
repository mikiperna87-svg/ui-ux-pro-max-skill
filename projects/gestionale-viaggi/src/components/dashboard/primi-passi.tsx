'use client'

import { Check, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import type { StatoPrimiPassi } from '@/lib/primi-passi'
import { primiPassiAction } from '@/server/actions/settings'

/**
 * Il percorso del primo giorno.
 *
 * Un gestionale vuoto non si giudica dalle funzioni che ha: si giudica da quanto
 * ci vuole a far succedere la prima cosa utile. Qui stanno i passi in ordine,
 * ognuno con il motivo per cui conviene farlo e il comando che lo fa — perché un
 * elenco di cose da fare senza il «perché» si salta, e senza il comando si
 * rimanda.
 *
 * Lo stato di ogni passo è ricavato dai dati che ci sono, non memorizzato: una
 * spunta che resta accesa dopo che i dati sono stati cancellati è peggio che
 * nessuna spunta.
 */
export function PrimiPassi({
  stato,
  puoNascondere,
}: {
  stato: StatoPrimiPassi
  puoNascondere: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function nascondi() {
    startTransition(async () => {
      const esito = await primiPassiAction(false)
      if (esito.status === 'success') {
        toast.success(esito.message ?? 'Primi passi nascosti.')
        router.refresh()
      } else {
        toast.error(esito.message ?? 'Non siamo riusciti a salvare la scelta.')
      }
    })
  }

  const prossimo = stato.passi.find((passo) => !passo.fatto)

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>Primi passi</CardTitle>
          <p className="text-small text-text-muted">
            {stato.completo
              ? 'Tutto quello che serve c’è. Gli ultimi passi sono facoltativi.'
              : 'Quattro cose e il gestionale lavora con i tuoi dati, non con dati di esempio.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stato.completo ? 'success' : 'accent'} dot>
            {stato.fatti} di {stato.totale} fatti
          </Badge>
          {puoNascondere ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={nascondi}
              disabled={pending}
              aria-label="Nascondi i primi passi"
            >
              <X aria-hidden="true" />
              Nascondi
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ol className="divide-y divide-border">
          {stato.passi.map((passo, indice) => (
            <li
              key={passo.chiave}
              className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6"
            >
              {/* Il numero diventa una spunta quando il passo è fatto: la forma
                  cambia insieme al colore, perché il colore da solo non basta. */}
              <span
                aria-hidden="true"
                className={
                  passo.fatto
                    ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-fg [&_svg]:size-4'
                    : 'flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-caption font-semibold text-text-muted'
                }
              >
                {passo.fatto ? <Check /> : indice + 1}
              </span>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-small font-medium text-text">{passo.titolo}</p>
                  <span className="sr-only">{passo.fatto ? 'Fatto' : 'Da fare'}</span>
                  {passo.facoltativo ? (
                    <Badge tone="neutral">Facoltativo</Badge>
                  ) : null}
                </div>
                <p className="text-caption text-text-muted">{passo.motivo}</p>
              </div>

              <div className="shrink-0">
                {passo.fatto ? (
                  <Badge tone="success" dot>
                    Fatto
                  </Badge>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    variant={passo.chiave === prossimo?.chiave ? 'primary' : 'secondary'}
                  >
                    <Link href={passo.href}>{passo.azione}</Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/** Il comando per rimettere i primi passi in panoramica, dalle impostazioni. */
export function RiapriPrimiPassi() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const esito = await primiPassiAction(true)
          if (esito.status === 'success') {
            toast.success(esito.message ?? 'Primi passi di nuovo visibili.')
            router.refresh()
          } else {
            toast.error(esito.message ?? 'Non siamo riusciti a salvare la scelta.')
          }
        })
      }
    >
      Mostra di nuovo i primi passi
    </Button>
  )
}
