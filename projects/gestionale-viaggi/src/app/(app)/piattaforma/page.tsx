import { Building2 } from 'lucide-react'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableCellNumeric,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { formatDateShort } from '@/lib/date'
import { agenziePiattaforma, membriPiattaforma, pianiAttivi } from '@/server/queries/piattaforma'
import { requirePlatformAdmin } from '@/server/session'
import { AzioniAgenzia } from './azioni-agenzia'

export const metadata: Metadata = { title: 'Piattaforma' }

/** Colore *e* parola: su uno stato commerciale la sfumatura non basta. */
const TONO_ABBONAMENTO: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  prova: 'info',
  attivo: 'success',
  scaduto: 'warning',
  annullato: 'danger',
}

const ETICHETTA_ABBONAMENTO: Record<string, string> = {
  prova: 'In prova',
  attivo: 'Attivo',
  scaduto: 'Scaduto',
  annullato: 'Annullato',
}

export default async function PiattaformaPage() {
  await requirePlatformAdmin()

  const [agenzie, membri, piani] = await Promise.all([
    agenziePiattaforma(),
    membriPiattaforma(),
    pianiAttivi(),
  ])
  const nomePiano = new Map(piani.map((p) => [p.code, p.name]))
  const attive = agenzie.filter((a) => a.suspended_at === null).length

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title="Agenzie sulla piattaforma"
        description={
          agenzie.length === 0
            ? 'Nessuna agenzia registrata.'
            : `${agenzie.length} agenzie, ${attive} attive · qui si vedono i numeri, mai i dati di chi ci lavora`
        }
      />

      {agenzie.length === 0 ? (
        <EmptyState
          icon={<Building2 aria-hidden="true" />}
          title="Nessuna agenzia"
          description="Le agenzie compaiono qui appena qualcuno si registra con il codice di invito."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Elenco</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrapper label="Agenzie sulla piattaforma">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Agenzia</TableHeaderCell>
                    <TableHeaderCell>Titolare</TableHeaderCell>
                    <TableHeaderCell>Stato</TableHeaderCell>
                    <TableHeaderCell>Abbonamento</TableHeaderCell>
                    <TableHeaderCell className="text-right">Utenti</TableHeaderCell>
                    <TableHeaderCell className="text-right">Clienti</TableHeaderCell>
                    <TableHeaderCell className="text-right">Pratiche</TableHeaderCell>
                    <TableHeaderCell className="text-right">Fatture</TableHeaderCell>
                    <TableHeaderCell>Ultima attività</TableHeaderCell>
                    <TableHeaderCell><span className="sr-only">Azioni</span></TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agenzie.map((agenzia) => {
                    const titolare = (membri.get(agenzia.id ?? '') ?? []).find(
                      (m) => m.role === 'titolare',
                    )
                    const sospesa = agenzia.suspended_at !== null
                    return (
                      <TableRow key={agenzia.id}>
                        <TableCell>
                          <span className="block font-medium text-text">{agenzia.name}</span>
                          <span className="block text-small text-text-subtle">
                            {[agenzia.vat_number, agenzia.city].filter(Boolean).join(' · ') || '—'}
                          </span>
                          <span className="block text-caption text-text-subtle">
                            Dal {formatDateShort(agenzia.created_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="block text-text">{titolare?.full_name ?? '—'}</span>
                          <span className="block text-small text-text-subtle">
                            {titolare?.email ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge tone={sospesa ? 'warning' : 'success'} dot>
                            {sospesa ? 'Sospesa' : 'Attiva'}
                          </Badge>
                          {sospesa && agenzia.suspension_reason ? (
                            <span className="mt-1 block max-w-[22rem] text-small text-text-subtle">
                              {agenzia.suspension_reason}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {agenzia.plan_code ? (
                            <>
                              <Badge tone={TONO_ABBONAMENTO[agenzia.subscription_status ?? 'prova']} dot>
                                {ETICHETTA_ABBONAMENTO[agenzia.subscription_status ?? 'prova']}
                              </Badge>
                              <span className="mt-1 block text-small text-text-subtle">
                                {nomePiano.get(agenzia.plan_code) ?? agenzia.plan_code}
                                {agenzia.valid_until
                                  ? ` · fino al ${formatDateShort(agenzia.valid_until)}`
                                  : ' · senza scadenza'}
                              </span>
                            </>
                          ) : (
                            <span className="text-small text-text-subtle">Nessuno</span>
                          )}
                        </TableCell>
                        <TableCellNumeric>{agenzia.members ?? 0}</TableCellNumeric>
                        <TableCellNumeric>{agenzia.customers ?? 0}</TableCellNumeric>
                        <TableCellNumeric>{agenzia.bookings ?? 0}</TableCellNumeric>
                        <TableCellNumeric>{agenzia.invoices ?? 0}</TableCellNumeric>
                        <TableCell className="text-text-muted">
                          {/* Una data e non «fra tre giorni»: il registro può
                              contenere righe con data futura, e un'ultima
                              attività nel futuro si legge come un errore. */}
                          {agenzia.last_activity ? formatDateShort(agenzia.last_activity) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {agenzia.id ? (
                            <AzioniAgenzia
                              agencyId={agenzia.id}
                              nome={agenzia.name ?? 'questa agenzia'}
                              sospesa={sospesa}
                              piani={piani.map((p) => ({ code: p.code, name: p.name }))}
                              pianoAttuale={agenzia.plan_code}
                              statoAttuale={agenzia.subscription_status}
                              scadenzaAttuale={agenzia.valid_until}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}

      <p className="text-small text-text-subtle">
        Questo pannello mostra quante righe ha ogni agenzia, non che cosa contengono. Clienti,
        pratiche, preventivi e fatture restano leggibili soltanto da chi appartiene all’agenzia:
        vale anche qui, ed è verificato dai test.
      </p>
    </div>
  )
}
