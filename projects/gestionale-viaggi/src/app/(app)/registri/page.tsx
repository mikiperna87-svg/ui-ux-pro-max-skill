import { Download } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton'
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
import { INVOICE_KIND, VAT_REGIME, nomeMese, plurale } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { vatRegister, type RegisterRow } from '@/server/queries/fatture'
import { requireSession } from '@/server/session'
import { EtichettaBottone } from '@/components/ui/etichetta-bottone'

export const metadata: Metadata = { title: 'Registro IVA' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function annoDa(valore: string | string[] | undefined): number {
  const testo = Array.isArray(valore) ? valore[0] : valore
  const numero = Number(testo)
  // Un anno inventato nell'indirizzo non deve arrivare al database.
  return Number.isInteger(numero) && numero >= 2000 && numero <= 2100
    ? numero
    : new Date().getFullYear()
}

export default async function RegistriPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSession()
  const raw = await searchParams
  const anno = annoDa(raw.anno)

  return (
    <div className="mx-auto max-w-[100rem] space-y-5">
      <PageHeader
        title="Registro IVA delle vendite"
        description="Imponibile, imposta e margine per mese, regime e aliquota. Le bozze non ci sono: non sono documenti."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/fatture">Vai alle fatture</Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`/registri/esporta?anno=${anno}`} aria-label="Esporta il registro">
                <Download aria-hidden="true" />
                <EtichettaBottone>Esporta</EtichettaBottone>
              </a>
            </Button>
          </>
        }
      />

      <Suspense key={anno} fallback={<Scheletro />}>
        <Corpo anno={anno} />
      </Suspense>
    </div>
  )
}

function Scheletro() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <Skeleton key={indice} className="h-24 rounded-lg" />
        ))}
      </div>
      <TableSkeleton rows={8} columns={6} />
    </div>
  )
}

async function Corpo({ anno }: { anno: number }) {
  const registro = await vatRegister(anno)

  // Le righe arrivano già aggregate per mese, tipo, regime e aliquota: qui si
  // raggruppano per mese, che è come si legge un registro.
  const mesi = new Map<number, RegisterRow[]>()
  for (const riga of registro.rows) {
    const gruppo = mesi.get(riga.month) ?? []
    gruppo.push(riga)
    mesi.set(riga.month, gruppo)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {registro.years.map((valore) => (
          <Button
            key={valore}
            asChild
            variant={valore === anno ? 'primary' : 'secondary'}
            size="sm"
          >
            <Link href={`/registri?anno=${valore}`} aria-current={valore === anno ? 'page' : undefined}>
              {valore}
            </Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Documenti"
          value={String(registro.totals.documenti)}
          hint={plurale(registro.totals.documenti, 'documento emesso', 'documenti emessi')}
        />
        <KpiCard
          label="Imponibile"
          value={formatEuro(registro.totals.imponibile)}
          hint="Note di credito già sottratte"
        />
        <KpiCard
          label="IVA a debito"
          value={formatEuro(registro.totals.iva)}
          hint="Imposta sulle vendite dell’anno"
        />
        <KpiCard
          label="Margine 74-ter"
          value={formatEuro(registro.totals.margine)}
          hint="Corrispettivi meno costi del viaggio"
        />
      </div>

      {registro.rows.length === 0 ? (
        <EmptyState
          title={`Nessun documento emesso nel ${anno}`}
          description="Il registro si popola quando una fattura viene emessa: le bozze non compaiono."
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/fatture">Vai alle fatture</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Anno {anno}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrapper label="Registro IVA per mese e aliquota" className="hidden rounded-none border-0 shadow-none md:block">
              <Table>
                <caption className="sr-only">
                  Registro IVA delle vendite dell’anno {anno}, per mese, regime e aliquota
                </caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Mese</TableHeaderCell>
                    <TableHeaderCell>Regime e aliquota</TableHeaderCell>
                    <TableHeaderCell className="text-right">Documenti</TableHeaderCell>
                    <TableHeaderCell className="text-right">Margine</TableHeaderCell>
                    <TableHeaderCell className="text-right">Imponibile</TableHeaderCell>
                    <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                    <TableHeaderCell className="text-right">Totale</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {[...mesi.entries()].map(([mese, righe]) =>
                    righe.map((riga, indice) => (
                      <TableRow key={`${mese}-${riga.kind}-${riga.vat_regime}-${riga.vat_bps}`}>
                        <TableCell>
                          {indice === 0 ? (
                            <span className="font-medium capitalize text-text">
                              {nomeMese(mese)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-text">
                              {VAT_REGIME[riga.vat_regime].label} {formatPercent(riga.vat_bps)}
                            </span>
                            {riga.kind === 'nota_credito' ? (
                              <Badge tone="neutral">{INVOICE_KIND.nota_credito}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCellNumeric>{riga.documents_count}</TableCellNumeric>
                        <TableCellNumeric className="text-text-muted">
                          {riga.vat_regime === 'art_74_ter' ? formatEuro(riga.margin_cents) : '—'}
                        </TableCellNumeric>
                        <TableCellNumeric>{formatEuro(riga.taxable_cents)}</TableCellNumeric>
                        <TableCellNumeric>{formatEuro(riga.vat_cents)}</TableCellNumeric>
                        <TableCellNumeric>{formatEuro(riga.total_cents)}</TableCellNumeric>
                      </TableRow>
                    )),
                  )}
                  <TableRow>
                    <TableCell className="font-medium text-text">Totale {anno}</TableCell>
                    <TableCell />
                    <TableCellNumeric className="font-medium">
                      {registro.totals.documenti}
                    </TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(registro.totals.margine)}
                    </TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(registro.totals.imponibile)}
                    </TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(registro.totals.iva)}
                    </TableCellNumeric>
                    <TableCellNumeric className="font-medium">
                      {formatEuro(registro.totals.totale)}
                    </TableCellNumeric>
                  </TableRow>
                </TableBody>
              </Table>
            </TableWrapper>

            {/* Sette colonne su 390 px non si leggono: una scheda per mese. */}
            <ul className="divide-y divide-border md:hidden">
              {[...mesi.entries()].map(([mese, righe]) => (
                <li key={mese} className="space-y-2 p-4">
                  <p className="font-medium capitalize text-text">{nomeMese(mese)}</p>
                  {righe.map((riga) => (
                    <div
                      key={`${riga.kind}-${riga.vat_regime}-${riga.vat_bps}`}
                      className="rounded-md bg-surface-2 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-small text-text">
                          {VAT_REGIME[riga.vat_regime].label} {formatPercent(riga.vat_bps)}
                          {riga.kind === 'nota_credito' ? ' · nota di credito' : ''}
                        </p>
                        <p className="num shrink-0 text-small font-medium text-text">
                          {formatEuro(riga.total_cents)}
                        </p>
                      </div>
                      <p className="num mt-0.5 text-caption text-text-muted">
                        imponibile {formatEuro(riga.taxable_cents)} · IVA{' '}
                        {formatEuro(riga.vat_cents)}
                        {riga.vat_regime === 'art_74_ter'
                          ? ` · margine ${formatEuro(riga.margin_cents)}`
                          : ''}
                      </p>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
