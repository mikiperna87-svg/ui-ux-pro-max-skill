'use client'

import { CircleAlert, CircleCheck, FileUp, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from '@/components/ui/table'
import { parseCsv } from '@/lib/csv'
import { buildRowValues, mapHeaders, type HeaderMapping } from '@/lib/import-maps'
import { IMPORT_DEFINITIONS, type ImportEntity } from '@/lib/import-registry'
import { cn } from '@/lib/utils'
import type { ImportReport } from '@/lib/action-state'
import { importRowsAction } from '@/server/actions/anagrafiche'
import { plurale } from '@/lib/labels'

interface PreparedRow {
  readonly line: number
  readonly values: Record<string, unknown>
  readonly label: string
  readonly error: string | null
}

/**
 * Importazione da CSV in due tempi: prima si vede cosa entrerà, poi si
 * conferma. Il file viene letto nel browser per dare un'anteprima immediata,
 * ma la validazione che decide è quella del server.
 */
export function CsvImport({ entity, title }: { entity: ImportEntity; title: string }) {
  // Schemi e funzioni non attraversano il confine server/client: qui si
  // risolve la definizione a partire dal solo nome dell'entità.
  const { fields, schema, labelFor, listHref, templateHref } = IMPORT_DEFINITIONS[entity]
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [mappings, setMappings] = useState<readonly HeaderMapping[]>([])
  const [rows, setRows] = useState<readonly PreparedRow[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)

  const valid = rows.filter((row) => row.error === null)
  const invalid = rows.filter((row) => row.error !== null)

  async function onFile(file: File) {
    setParseError(null)
    setReport(null)
    setFileName(file.name)

    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      const headerMappings = mapHeaders(parsed.headers, fields)

      const missing = headerMappings.filter((mapping) => mapping.required && !mapping.header)
      if (missing.length > 0) {
        setMappings(headerMappings)
        setRows([])
        setParseError(
          `Nel file mancano le colonne obbligatorie: ${missing.map((entry) => entry.label).join(', ')}.`,
        )
        return
      }

      const prepared = parsed.rows.map((row, index) => {
        const values = buildRowValues(row, fields, headerMappings)
        const result = schema.safeParse(values)
        return {
          line: index + 2,
          values,
          label: labelFor(values),
          error: result.success ? null : (result.error.issues[0]?.message ?? 'Dati non validi'),
        }
      })

      setMappings(headerMappings)
      setRows(prepared)
    } catch (error) {
      setMappings([])
      setRows([])
      setParseError(error instanceof Error ? error.message : 'File non leggibile.')
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await importRowsAction(
        entity,
        valid.map((row) => ({ line: row.line, values: row.values })),
      )
      setReport(result)
      if (result.status === 'success') {
        toast.success(result.message ?? 'Importazione completata.')
        router.refresh()
      } else {
        toast.error(result.message ?? 'Importazione non riuscita.')
      }
    })
  }

  const recognized = mappings.filter((mapping) => mapping.header)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <p className="text-small text-text-muted">
              Il file deve avere una riga di intestazione. Sono ammessi il punto e virgola e la
              virgola come separatore.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <a href={templateHref} download>
              <FileUp aria-hidden="true" />
              Scarica il modello
            </a>
          </Button>
        </CardHeader>
        <CardContent>
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2 px-6 py-10 text-center',
              'transition-colors duration-150 hover:border-accent hover:bg-accent-subtle/40',
            )}
          >
            <Upload className="size-5 text-text-subtle" aria-hidden="true" />
            <span className="text-small font-medium text-text">
              {fileName ?? 'Scegli un file CSV'}
            </span>
            <span className="text-caption text-text-muted">
              Le colonne vengono riconosciute automaticamente dal nome.
            </span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
          </label>

          {parseError ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-danger-subtle bg-danger-subtle/50 px-3 py-2 text-small text-danger-fg">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {parseError}
            </p>
          ) : null}

          {recognized.length > 0 ? (
            <div className="mt-4 space-y-2">
              <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
                Colonne riconosciute
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mappings.map((mapping) => (
                  <Badge
                    key={mapping.field}
                    tone={mapping.header ? 'success' : mapping.required ? 'danger' : 'neutral'}
                  >
                    {mapping.label}
                    {mapping.header ? ` ← ${mapping.header}` : ' · assente'}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="space-y-1">
              <CardTitle>Anteprima</CardTitle>
              <p className="text-small text-text-muted">
                <span className="num font-medium text-success">{valid.length}</span>{' '}
                {valid.length === 1 ? 'riga pronta' : 'righe pronte'}
                {invalid.length > 0 ? (
                  <>
                    {' · '}
                    <span className="num font-medium text-danger">{invalid.length}</span> da
                    correggere nel file
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href={listHref}>Annulla</Link>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={confirm}
                disabled={pending || valid.length === 0}
              >
                {pending ? 'Importazione...' : `Importa ${plurale(valid.length, 'riga', 'righe')}`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <TableWrapper className="max-h-96 overflow-y-auto rounded-none border-0 shadow-none">
              <Table>
                <caption className="sr-only">Righe del file con il loro esito</caption>
                <TableHead>
                  <tr>
                    <TableHeaderCell className="w-16">Riga</TableHeaderCell>
                    <TableHeaderCell>Contenuto</TableHeaderCell>
                    <TableHeaderCell>Esito</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {rows.slice(0, 200).map((row) => (
                    <TableRow key={row.line}>
                      <TableCell className="num text-text-muted">{row.line}</TableCell>
                      <TableCell className="max-w-72 truncate">{row.label || '—'}</TableCell>
                      <TableCell>
                        {row.error ? (
                          <span className="flex items-center gap-1.5 text-small text-danger">
                            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                            {row.error}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-small text-success">
                            <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                            Pronta
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
            {rows.length > 200 ? (
              <p className="border-t border-border px-4 py-2 text-caption text-text-muted">
                Mostrate le prime 200 righe di <span className="num">{rows.length}</span>.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {report ? (
        <Card>
          <CardHeader>
            <CardTitle>Esito dell’importazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-small text-text">{report.message}</p>
            {report.skipped.length > 0 ? (
              <div className="space-y-1">
                <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
                  Già in archivio, non reinserite
                </p>
                <ul className="space-y-1 text-caption text-text-muted">
                  {report.skipped.slice(0, 20).map((riga) => (
                    <li key={riga.line}>
                      Riga <span className="num">{riga.line}</span>: {riga.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.failed.length > 0 ? (
              <div className="space-y-1">
                <p className="text-caption font-semibold uppercase tracking-wide text-text-subtle">
                  Scartate
                </p>
                <ul className="space-y-1 text-caption text-text-muted">
                  {report.failed.slice(0, 20).map((failure) => (
                    <li key={failure.line}>
                      Riga <span className="num">{failure.line}</span>: {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Button asChild variant="primary" size="sm">
              <Link href={listHref}>Vai all’elenco</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
