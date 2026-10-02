'use client'

import { AlertTriangle, CheckCircle2, Mail, RotateCcw, Send, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { FormMessage } from '@/components/forms/form-message'
import { SubmitButton } from '@/components/forms/submit-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { IDLE } from '@/lib/action-state'
import { formatDateTime } from '@/lib/date'
import type { Tables } from '@/lib/database.types'
import { EMAIL_KIND, EMAIL_STATUS } from '@/lib/labels'
import {
  annullaEmailAction,
  provaEmailAction,
  rinviaEmailAction,
  salvaImpostazioniEmailAction,
} from '@/server/actions/email'
import type { EmailRow, StatoPosta } from '@/server/queries/email'

/**
 * La posta dell'agenzia: com'è configurata, com'è firmata, che cosa è partito.
 *
 * La chiave del fornitore non compare e non si può inserire da qui: sta fra le
 * variabili d'ambiente del server, dove un'interfaccia non la espone a nessuno.
 * Qui si dice soltanto se c'è, con quale mittente, e che fine hanno fatto i
 * messaggi.
 */
export function PostaPanel({
  settings,
  stato,
  messaggi,
}: {
  settings: Tables<'agency_settings'>
  stato: StatoPosta
  messaggi: readonly EmailRow[]
}) {
  return (
    <div className="space-y-4">
      <StatoConfigurazione stato={stato} />
      <ImpostazioniForm settings={settings} />
      <ProvaInvio configurata={stato.configurata} />
      <CodaMessaggi messaggi={messaggi} />
    </div>
  )
}

function StatoConfigurazione({ stato }: { stato: StatoPosta }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stato della posta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={
            stato.configurata
              ? 'flex items-start gap-3 rounded-lg border border-success-subtle bg-success-subtle/40 p-3'
              : 'flex items-start gap-3 rounded-lg border border-warning-subtle bg-warning-subtle/50 p-3'
          }
        >
          {stato.configurata ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden="true" />
          )}
          <div className="min-w-0 space-y-1">
            {stato.configurata ? (
              <>
                <p className="text-small font-medium text-text">Fornitore di posta collegato</p>
                <p className="text-small text-text-muted">
                  I messaggi partono da <span className="font-medium text-text">{stato.mittente}</span>.
                </p>
              </>
            ) : (
              <>
                <p className="text-small font-medium text-text">
                  Nessun fornitore di posta configurato
                </p>
                <p className="text-small text-text-muted">
                  I messaggi vengono comunque scritti nella coda qui sotto e non si perdono: partiranno
                  quando il server avrà le variabili <code className="num">RESEND_API_KEY</code> e{' '}
                  <code className="num">EMAIL_MITTENTE</code>. Fino ad allora nulla risulta inviato.
                </p>
              </>
            )}
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <dt className="text-caption uppercase tracking-wide text-text-subtle">Inviate</dt>
            <dd className="num mt-1 text-heading font-semibold text-text">{stato.inviate}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <dt className="text-caption uppercase tracking-wide text-text-subtle">In coda</dt>
            <dd className="num mt-1 text-heading font-semibold text-text">{stato.inCoda}</dd>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <dt className="text-caption uppercase tracking-wide text-text-subtle">In errore</dt>
            <dd
              className={
                stato.errori > 0
                  ? 'num mt-1 text-heading font-semibold text-danger'
                  : 'num mt-1 text-heading font-semibold text-text'
              }
            >
              {stato.errori}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

function ImpostazioniForm({ settings }: { settings: Tables<'agency_settings'> }) {
  const [state, submit] = useActionState(salvaImpostazioniEmailAction, IDLE)
  const [attiva, setAttiva] = useState(settings.email_enabled)

  const iniziale = (campo: string, ripiego: string | null) =>
    state.values?.[campo] ?? (ripiego ?? '')

  return (
    <form action={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Come si presenta l’agenzia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-2 p-3">
            <div className="min-w-0">
              <p className="text-small font-medium text-text">Invio delle email attivo</p>
              <p className="mt-0.5 text-caption text-text-muted">
                Spento, i messaggi restano registrati come annullati: utile durante una prova o una
                migrazione, quando i clienti non devono ricevere nulla.
              </p>
            </div>
            <Switch
              name="email_enabled"
              checked={attiva}
              onCheckedChange={setAttiva}
              aria-label="Invio delle email attivo"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome del mittente"
              hint="Come compare nella casella del cliente."
              error={state.fieldErrors?.email_from_name}
            >
              {(props) => (
                <Input
                  {...props}
                  name="email_from_name"
                  maxLength={80}
                  placeholder="Orizzonti Viaggi"
                  defaultValue={iniziale('email_from_name', settings.email_from_name)}
                />
              )}
            </Field>

            <Field
              label="Indirizzo per le risposte"
              hint="Dove arrivano le risposte dei clienti. Vuoto: l’indirizzo dell’agenzia."
              error={state.fieldErrors?.email_reply_to}
            >
              {(props) => (
                <Input
                  {...props}
                  name="email_reply_to"
                  type="email"
                  placeholder="info@orizzontiviaggi.it"
                  defaultValue={iniziale('email_reply_to', settings.email_reply_to)}
                />
              )}
            </Field>
          </div>

          <Field
            label="Firma"
            hint="Chiude ogni messaggio, sotto il testo. Va a capo dove lo scrivi."
            error={state.fieldErrors?.email_signature}
          >
            {(props) => (
              <Textarea
                {...props}
                name="email_signature"
                rows={3}
                maxLength={500}
                placeholder={'Un caro saluto,\nGiulia Marchetti\nOrizzonti Viaggi'}
                defaultValue={iniziale('email_signature', settings.email_signature)}
              />
            )}
          </Field>
        </CardContent>
        <CardFooter className="justify-between">
          <FormMessage status={state.status} message={state.message} className="mr-auto" />
          <SubmitButton pendingLabel="Salvataggio...">Salva</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  )
}

function ProvaInvio({ configurata }: { configurata: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [state, submit] = useActionState(provaEmailAction, IDLE)

  useEffect(() => {
    if (state.status === 'success') {
      toast.success(state.message ?? 'Messaggio di prova inviato.')
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={submit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Prova di invio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-small text-text-muted">
            {configurata
              ? 'Manda a te stesso un messaggio con l’intestazione dell’agenzia: è il modo più rapido per vedere che cosa riceve il cliente.'
              : 'Senza fornitore di posta la prova resta in coda: serve comunque a controllare che il messaggio venga composto e registrato.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Indirizzo di prova" required error={state.fieldErrors?.to}>
              {(props) => (
                <Input
                  {...props}
                  name="to"
                  type="email"
                  className="sm:w-80"
                  placeholder="tu@orizzontiviaggi.it"
                  defaultValue={state.values?.to ?? ''}
                />
              )}
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Invio...">
              <Send aria-hidden="true" />
              Invia la prova
            </SubmitButton>
          </div>
          <FormMessage status={state.status} message={state.message} />
        </CardContent>
      </Card>
    </form>
  )
}

function CodaMessaggi({ messaggi }: { messaggi: readonly EmailRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [, startTransition] = useTransition()

  function agisci(azione: (id: string) => Promise<{ status: string; message?: string }>, id: string) {
    startTransition(async () => {
      const esito = await azione(id)
      if (esito.status === 'success') toast.success(esito.message ?? 'Fatto.')
      else toast.error(esito.message ?? 'Operazione non riuscita.')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Messaggi</CardTitle>
      </CardHeader>
      <CardContent className={messaggi.length === 0 ? undefined : 'p-0'}>
        {messaggi.length === 0 ? (
          <EmptyState
            icon={<Mail />}
            title="Nessun messaggio"
            description="Qui compare tutto ciò che il gestionale ha scritto ai clienti: preventivi, documenti e promemoria, con il loro esito."
          />
        ) : (
          <ul className="divide-y divide-border">
            {messaggi.map((messaggio) => (
              <li key={messaggio.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge tone={EMAIL_STATUS[messaggio.status].tone} dot>
                      {EMAIL_STATUS[messaggio.status].label}
                    </Badge>
                    <Badge tone="neutral">{EMAIL_KIND[messaggio.kind]}</Badge>
                    <p className="min-w-0 truncate text-small font-medium text-text">
                      {messaggio.subject}
                    </p>
                  </div>

                  {messaggio.status === 'in_coda' || messaggio.status === 'errore' ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => agisci(rinviaEmailAction, messaggio.id)}
                      >
                        <RotateCcw aria-hidden="true" />
                        Rimanda
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => agisci(annullaEmailAction, messaggio.id)}
                      >
                        <XCircle aria-hidden="true" />
                        Annulla
                      </Button>
                    </div>
                  ) : null}
                </div>

                <p className="truncate text-caption text-text-muted">
                  A {messaggio.to_email} · {formatDateTime(messaggio.created_at)}
                  {messaggio.sent_at ? ` · inviato ${formatDateTime(messaggio.sent_at)}` : ''}
                  {messaggio.attachment_name ? ` · allegato ${messaggio.attachment_name}` : ''}
                  {messaggio.attempts > 0 ? ` · ${messaggio.attempts} tentativi` : ''}
                </p>

                {messaggio.error_message ? (
                  <p className="rounded-md bg-danger-subtle/40 px-2.5 py-1.5 text-caption text-danger-fg">
                    {messaggio.error_message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
