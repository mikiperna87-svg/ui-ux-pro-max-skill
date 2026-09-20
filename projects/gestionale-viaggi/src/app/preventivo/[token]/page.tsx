import { CalendarDays, Check, MapPin, Plane, Users } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { formatDateLong, formatDateShort } from '@/lib/date'
import type { Enums } from '@/lib/database.types'
import { QUOTE_VARIANT, SERVICE_TYPE, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import type { QuotePublic, QuotePublicItem } from '@/server/queries/preventivi'
import { getQuotePublic } from '@/server/queries/preventivi'
import { RispostaPreventivo } from './risposta-preventivo'

type Variante = Enums['quote_variant']

const ORDINE: readonly Variante[] = ['base', 'consigliata', 'premium']

const COLONNE: Record<number, string> = {
  1: 'grid gap-4',
  2: 'grid gap-4 md:grid-cols-2',
  3: 'grid gap-4 md:grid-cols-2 xl:grid-cols-3',
}

export const metadata: Metadata = {
  title: 'La sua proposta di viaggio',
  robots: { index: false, follow: false },
}

/**
 * Il preventivo visto dal cliente.
 *
 * Fuori dal gestionale: niente barra laterale, niente login, nessun dato
 * interno. Si vedono le proposte con il loro prezzo finale — mai i costi, mai
 * il margine — e i due comandi per rispondere. Chi apre questo indirizzo ha
 * ricevuto il collegamento via email e spesso legge dal telefono: la pagina è
 * pensata prima per quello schermo.
 */
export default async function PreventivoPubblicoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dati = await getQuotePublic(token)

  // Token inesistente, preventivo cancellato o ancora in bozza: la stessa
  // risposta, così il collegamento non racconta nulla a chi lo indovina.
  if (!dati) notFound()

  const { quote, items } = dati

  const varianti = ORDINE.filter((variante) =>
    items.some((riga) => riga.variant === variante),
  ).map((variante) => {
    const righe = items.filter((riga) => riga.variant === variante)
    return {
      variant: variante,
      righe,
      totale: righe.reduce((somma, riga) => somma + riga.total_price_cents, 0),
    }
  })

  const chiuso =
    quote.status === 'accettato' || quote.status === 'convertito' || quote.status === 'rifiutato'
  const puoRispondere = !chiuso && !quote.is_expired && varianti.length > 0

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-[var(--brand-950)] text-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <span className="flex items-center gap-2 text-small font-semibold">
            <span className="grid size-7 place-items-center rounded-md bg-white/15">
              <Plane className="size-4" aria-hidden="true" />
            </span>
            {quote.agency_name}
          </span>
          <span className="num text-caption text-white/60">Preventivo {quote.code}</span>
        </div>
      </header>

      <main id="contenuto" className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <section className="space-y-3">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-text sm:text-[2rem]">
            {quote.title}
          </h1>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-small text-text-muted">
            <li className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
              {quote.destination}
            </li>
            {quote.departure_date ? (
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                {quote.return_date
                  ? `Dal ${formatDateShort(quote.departure_date)} al ${formatDateShort(quote.return_date)}`
                  : `Partenza il ${formatDateLong(quote.departure_date)}`}
              </li>
            ) : null}
            <li className="flex items-center gap-1.5">
              <Users className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
              {plurale(quote.pax_count, 'passeggero', 'passeggeri')}
            </li>
          </ul>

          {quote.intro_text ? (
            <p className="max-w-2xl whitespace-pre-line text-body text-text">{quote.intro_text}</p>
          ) : null}
        </section>

        <Esito quote={quote} />

        {varianti.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-center text-body text-text-muted">
            Questa proposta è ancora in preparazione. La contatteremo appena è pronta.
          </p>
        ) : (
          <section className="space-y-4">
            <h2 className="text-heading font-semibold text-text">
              {varianti.length === 1 ? 'La proposta' : 'Le proposte a confronto'}
            </h2>

            {/* Le colonne sono scritte per esteso: Tailwind legge le classi dal
                sorgente, una stringa composta a runtime non verrebbe generata. */}
            <div className={COLONNE[Math.min(varianti.length, 3)] ?? COLONNE[3]}>
              {varianti.map((proposta) => (
                <SchedaProposta
                  key={proposta.variant}
                  variante={proposta.variant}
                  righe={proposta.righe}
                  totale={proposta.totale}
                  pax={quote.pax_count}
                  accettata={quote.accepted_variant === proposta.variant}
                />
              ))}
            </div>
          </section>
        )}

        {puoRispondere ? (
          <section className="rounded-lg border border-border bg-surface p-5 shadow-e1">
            <RispostaPreventivo
              token={token}
              scelte={varianti.map(({ variant, totale }) => ({ variant, totale }))}
            />
            {quote.valid_until ? (
              <p className="mt-4 text-caption text-text-muted">
                La proposta è valida fino al {formatDateLong(quote.valid_until)}.
              </p>
            ) : null}
          </section>
        ) : null}

        {quote.terms_text ? (
          <section className="space-y-2 border-t border-border pt-5">
            <h2 className="text-small font-medium uppercase tracking-wide text-text-subtle">
              Condizioni
            </h2>
            <p className="whitespace-pre-line text-small text-text-muted">{quote.terms_text}</p>
          </section>
        ) : null}

        <footer className="border-t border-border pt-5 text-caption text-text-muted">
          <p className="font-medium text-text">{quote.agency_name}</p>
          <p className="mt-0.5">
            {[
              quote.agency_email,
              quote.agency_phone,
              quote.agency_vat ? `P. IVA ${quote.agency_vat}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </footer>
      </main>
    </div>
  )
}

/** Il riquadro in cima che dice come è finita, quando è finita. */
function Esito({ quote }: { quote: QuotePublic['quote'] }) {
  if (quote.status === 'accettato' || quote.status === 'convertito') {
    return (
      <div className="rounded-lg border border-success-subtle bg-success-subtle/40 p-4">
        <p className="flex items-center gap-2 text-body font-medium text-success-fg">
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Proposta accettata
          {quote.accepted_variant ? `: ${QUOTE_VARIANT[quote.accepted_variant].label}` : ''}
        </p>
        <p className="mt-1 text-small text-text-muted">
          {quote.accepted_by_name ? `Confermata da ${quote.accepted_by_name}. ` : ''}
          La contatteremo per i passi successivi. Non serve fare altro da qui.
        </p>
      </div>
    )
  }

  if (quote.status === 'rifiutato') {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-body font-medium text-text">Abbiamo registrato la sua risposta</p>
        <p className="mt-1 text-small text-text-muted">
          Grazie per averci avvisato. Se cambia idea o vuole una proposta diversa, ci scriva pure.
        </p>
      </div>
    )
  }

  if (quote.is_expired) {
    return (
      <div className="rounded-lg border border-warning-subtle bg-warning-subtle/40 p-4">
        <p className="text-body font-medium text-warning-fg">
          Questa proposta è scaduta il {formatDateShort(quote.valid_until)}
        </p>
        <p className="mt-1 text-small text-text-muted">
          I prezzi qui sotto non sono più garantiti. Ci contatti e le prepariamo un aggiornamento.
        </p>
      </div>
    )
  }

  return null
}

function SchedaProposta({
  variante,
  righe,
  totale,
  pax,
  accettata,
}: {
  variante: Variante
  righe: readonly QuotePublicItem[]
  totale: number
  pax: number
  accettata: boolean
}) {
  const perPersona = pax > 0 ? Math.round(totale / pax) : totale

  return (
    <article
      className={`flex flex-col rounded-lg border bg-surface shadow-e1 ${
        accettata ? 'border-success ring-1 ring-success' : 'border-border'
      }`}
    >
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-body font-semibold text-text">{QUOTE_VARIANT[variante].label}</h3>
            <p className="mt-0.5 text-caption text-text-muted">{QUOTE_VARIANT[variante].note}</p>
          </div>
          {accettata ? <Badge tone="success">Scelta</Badge> : null}
        </div>
      </div>

      <ul className="flex-1 divide-y divide-border">
        {righe.map((riga, indice) => (
          <li key={`${riga.description}-${indice}`} className="flex gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-small font-medium text-text">
                {riga.description}
                {riga.quantity > 1 ? (
                  <span className="num font-normal text-text-muted"> × {riga.quantity}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-caption text-text-muted">
                {[
                  SERVICE_TYPE[riga.service_type],
                  riga.date_from
                    ? riga.date_to && riga.date_to !== riga.date_from
                      ? `${formatDateShort(riga.date_from)} – ${formatDateShort(riga.date_to)}`
                      : formatDateShort(riga.date_from)
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {riga.details ? (
                <p className="mt-1 whitespace-pre-line text-caption text-text-muted">
                  {riga.details}
                </p>
              ) : null}
            </div>
            <p className="num shrink-0 text-small text-text">{formatEuro(riga.total_price_cents)}</p>
          </li>
        ))}
      </ul>

      <div className="border-t border-border bg-surface-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-small text-text-muted">Totale</span>
          <span className="num text-heading font-semibold text-text">{formatEuro(totale)}</span>
        </div>
        {pax > 1 ? (
          <p className="num mt-0.5 text-right text-caption text-text-muted">
            {formatEuro(perPersona)} a persona
          </p>
        ) : null}
      </div>
    </article>
  )
}
