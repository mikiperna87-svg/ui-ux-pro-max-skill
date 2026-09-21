/**
 * Lettura e scrittura di CSV, senza dipendenze esterne.
 *
 * Pensato per i file che un'agenzia produce davvero: esportazioni di Excel in
 * italiano (punto e virgola come separatore, virgola come decimale, BOM
 * iniziale) accanto a file standard con la virgola.
 */

export interface CsvParseResult {
  readonly headers: readonly string[]
  readonly rows: readonly Record<string, string>[]
  readonly delimiter: string
}

export class CsvError extends Error {
  constructor(
    message: string,
    /** Riga del file a cui si riferisce l'errore (1 = intestazione). */
    readonly line?: number,
  ) {
    super(message)
    this.name = 'CsvError'
  }
}

/** Riconosce il separatore osservando la prima riga fuori dalle virgolette. */
function detectDelimiter(firstLine: string): string {
  const candidates = [';', ',', '\t', '|']
  let best = ','
  let bestCount = 0
  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index]
      if (char === '"') inQuotes = !inQuotes
      else if (char === candidate && !inQuotes) count += 1
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** Divide il testo in celle rispettando virgolette, virgolette raddoppiate e ritorni a capo. */
function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let index = 0

  while (index < text.length) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      cell += char
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      index += 1
      continue
    }

    if (char === delimiter) {
      row.push(cell)
      cell = ''
      index += 1
      continue
    }

    if (char === '\r') {
      index += 1
      continue
    }

    if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      index += 1
      continue
    }

    cell += char
    index += 1
  }

  if (inQuotes) {
    throw new CsvError('Il file contiene virgolette non chiuse.')
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

/** Legge un CSV con intestazione e restituisce righe come oggetti. */
export function parseCsv(input: string, options: { delimiter?: string } = {}): CsvParseResult {
  // Excel scrive un BOM in testa: va rimosso o la prima colonna avrebbe un nome sbagliato.
  const text = input.replace(/^﻿/, '').trim()
  if (text === '') throw new CsvError('Il file è vuoto.')

  const firstLineEnd = text.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd)
  const delimiter = options.delimiter ?? detectDelimiter(firstLine)

  const table = tokenize(text, delimiter)
  const [headerRow, ...dataRows] = table

  if (!headerRow || headerRow.length === 0) {
    throw new CsvError('Manca la riga di intestazione.', 1)
  }

  const headers = headerRow.map((header) => header.trim())
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index)
  if (duplicate) {
    throw new CsvError(`La colonna "${duplicate}" compare due volte nell'intestazione.`, 1)
  }

  const rows = dataRows
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells, rowIndex) => {
      if (cells.length > headers.length) {
        throw new CsvError(
          `La riga ${rowIndex + 2} ha ${cells.length} colonne invece di ${headers.length}.`,
          rowIndex + 2,
        )
      }
      const record: Record<string, string> = {}
      headers.forEach((header, columnIndex) => {
        record[header] = (cells[columnIndex] ?? '').trim()
      })
      return record
    })

  return { headers, rows, delimiter }
}

/**
 * Associa le intestazioni del file ai campi attesi, ignorando maiuscole,
 * accenti e spazi: "Partita IVA", "partita_iva" e "PARTITAIVA" coincidono.
 */
export function matchHeader(headers: readonly string[], aliases: readonly string[]): string | null {
  const canonical = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')

  const wanted = aliases.map(canonical)
  return headers.find((header) => wanted.includes(canonical(header))) ?? null
}

/** Racchiude una cella fra virgolette solo quando serve. */
function escapeCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (text === '') return ''
  const needsQuotes =
    text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text
}

export interface CsvColumn<T> {
  readonly header: string
  readonly value: (row: T) => unknown
}

/**
 * Serializza righe in CSV. Il separatore predefinito è il punto e virgola e il
 * BOM viene incluso: è la combinazione che Excel italiano apre senza chiedere
 * nulla all'utente.
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  options: { delimiter?: string; bom?: boolean } = {},
): string {
  const delimiter = options.delimiter ?? ';'
  const bom = options.bom ?? true

  const lines = [
    columns.map((column) => escapeCell(column.header, delimiter)).join(delimiter),
    ...rows.map((row) =>
      columns.map((column) => escapeCell(column.value(row), delimiter)).join(delimiter),
    ),
  ]

  return `${bom ? '﻿' : ''}${lines.join('\r\n')}\r\n`
}

/** Converte una data scritta a mano ("14/03/2026", "2026-03-14") in ISO. */
export function csvDateToIso(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return trimmed

  const italian = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (italian) {
    const [, day, month, year] = italian
    const padded = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return Number.isNaN(Date.parse(padded)) ? null : padded
  }

  return null
}

/** Interpreta i valori che nei fogli di calcolo significano "sì". */
export function csvBoolean(value: string): boolean {
  return ['si', 'sì', 'yes', 'y', 'true', '1', 'x', 'vero'].includes(value.trim().toLowerCase())
}
