#!/usr/bin/env node
/**
 * Genera src/lib/database.types.ts introspezionando il database.
 *
 *   node scripts/gen-types.mjs
 *
 * I tipi NON si scrivono a mano: sono il riflesso dello schema. Dopo ogni
 * migrazione si riapplica il database e si rilancia questo script, cosi' un
 * campo rinominato rompe la compilazione invece di rompere la produzione.
 *
 * (L'alternativa ufficiale, `supabase gen types`, richiede Docker: questo
 * script produce la stessa forma di tipi lavorando su una qualunque URL
 * Postgres, locale o remota.)
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.resolve(here, '../src/lib/database.types.ts')
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

const SCALARS = new Map([
  ['uuid', 'string'], ['text', 'string'], ['varchar', 'string'], ['bpchar', 'string'],
  ['citext', 'string'], ['inet', 'string'], ['date', 'string'], ['time', 'string'],
  ['timestamp', 'string'], ['timestamptz', 'string'], ['interval', 'string'],
  ['int2', 'number'], ['int4', 'number'], ['int8', 'number'], ['float4', 'number'],
  ['float8', 'number'], ['numeric', 'number'], ['bool', 'boolean'],
  ['json', 'Json'], ['jsonb', 'Json'], ['bytea', 'string'],
])

function tsType(udt, enums) {
  if (udt.startsWith('_')) {
    return `${tsType(udt.slice(1), enums)}[]`
  }
  if (enums.has(udt)) return `Enums['${udt}']`
  return SCALARS.get(udt) ?? 'unknown'
}

/** "p_from date, p_owner_id uuid DEFAULT NULL::uuid" -> tipo degli argomenti RPC. */
function argsType(signature, enums) {
  const text = (signature ?? '').trim()
  if (text === '') return 'Record<string, never>'

  const parts = splitTopLevel(text)
  const fields = parts
    .map((part) => {
      const withoutDefault = part.split(/\sDEFAULT\s/i)[0].trim()
      const hasDefault = /\sDEFAULT\s/i.test(part)
      const tokens = withoutDefault.split(/\s+/)
      if (tokens.length < 2) return null
      const name = tokens[0]
      const type = tokens.slice(1).join(' ')
      // In Postgres nessun parametro e' NOT NULL: puo' sempre ricevere null.
      return `${name}${hasDefault ? '?' : ''}: ${sqlToTs(type, enums)} | null`
    })
    .filter(Boolean)

  return fields.length === 0 ? 'Record<string, never>' : `{ ${fields.join('; ')} }`
}

/** "TABLE(a bigint, b text)" / "SETOF activity_log" / "boolean" -> tipo di ritorno. */
function returnsType(result, enums) {
  const text = (result ?? '').trim()
  const table = text.match(/^TABLE\((.*)\)$/is)
  if (table) {
    const fields = splitTopLevel(table[1]).map((part) => {
      const tokens = part.trim().split(/\s+/)
      return `${tokens[0]}: ${sqlToTs(tokens.slice(1).join(' '), enums)} | null`
    })
    return `{ ${fields.join('; ')} }[]`
  }
  if (/^SETOF\s/i.test(text)) return 'unknown[]'
  return sqlToTs(text, enums)
}

function splitTopLevel(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

const SQL_NAMES = new Map([
  ['uuid', 'string'], ['text', 'string'], ['date', 'string'], ['inet', 'string'],
  ['character varying', 'string'], ['timestamp with time zone', 'string'],
  ['timestamp without time zone', 'string'], ['time without time zone', 'string'],
  ['integer', 'number'], ['bigint', 'number'], ['smallint', 'number'],
  ['numeric', 'number'], ['double precision', 'number'], ['real', 'number'],
  ['boolean', 'boolean'], ['json', 'Json'], ['jsonb', 'Json'], ['void', 'undefined'],
])

function sqlToTs(sqlType, enums) {
  const clean = sqlType.replace(/\[\]$/, '').replace(/^app\./, '').trim().toLowerCase()
  const isArray = sqlType.trim().endsWith('[]')
  const base = SQL_NAMES.get(clean) ?? (enums.has(clean) ? `Enums['${clean}']` : 'unknown')
  return isArray ? `${base}[]` : base
}

async function main() {
  const client = new pg.Client({ connectionString })
  await client.connect()

  const { rows: enumRows } = await client.query(`
    select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname in ('app', 'public')
    group by t.typname
    order by t.typname
  `)
  const enums = new Map(enumRows.map((row) => [row.name, row.labels]))

  const { rows: columns } = await client.query(`
    select
      c.table_name,
      t.table_type,
      c.column_name,
      c.ordinal_position,
      c.is_nullable = 'YES' as nullable,
      c.column_default is not null as has_default,
      c.is_generated = 'ALWAYS' as generated,
      c.identity_generation is not null as identity,
      c.udt_name as udt
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type in ('BASE TABLE', 'VIEW')
    order by c.table_name, c.ordinal_position
  `)

  // Solo le funzioni definite dalle nostre migrazioni: quelle installate dalle
  // estensioni (pgcrypto, unaccent) sono sovraccariche e non ci servono.
  const { rows: functions } = await client.query(`
    select
      p.proname as name,
      pg_get_function_arguments(p.oid) as args,
      pg_get_function_result(p.oid) as result
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
    order by p.proname
  `)

  await client.end()

  const tables = new Map()
  for (const column of columns) {
    if (!tables.has(column.table_name)) {
      tables.set(column.table_name, { type: column.table_type, columns: [] })
    }
    tables.get(column.table_name).columns.push(column)
  }

  const lines = []
  lines.push('// GENERATO AUTOMATICAMENTE — non modificare a mano.')
  lines.push('// Rigenerare con: npm run db:types (vedi scripts/gen-types.mjs)')
  lines.push('')
  lines.push('export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]')
  lines.push('')
  lines.push('export interface Enums {')
  for (const [name, labels] of [...enums].sort()) {
    lines.push(`  ${name}: ${labels.map((l) => `'${l}'`).join(' | ')}`)
  }
  lines.push('}')
  lines.push('')
  lines.push('export interface Database {')
  lines.push('  public: {')
  lines.push('    Tables: {')

  for (const [name, table] of [...tables].sort()) {
    if (table.type !== 'BASE TABLE') continue
    lines.push(`      ${name}: {`)
    lines.push('        Row: {')
    for (const c of table.columns) {
      lines.push(`          ${c.column_name}: ${tsType(c.udt, enums)}${c.nullable ? ' | null' : ''}`)
    }
    lines.push('        }')
    lines.push('        Insert: {')
    for (const c of table.columns) {
      if (c.generated) continue
      const optional = c.nullable || c.has_default || c.identity
      lines.push(
        `          ${c.column_name}${optional ? '?' : ''}: ${tsType(c.udt, enums)}${c.nullable ? ' | null' : ''}`,
      )
    }
    lines.push('        }')
    lines.push('        Update: {')
    for (const c of table.columns) {
      if (c.generated) continue
      lines.push(`          ${c.column_name}?: ${tsType(c.udt, enums)}${c.nullable ? ' | null' : ''}`)
    }
    lines.push('        }')
    lines.push('        Relationships: []')
    lines.push('      }')
  }
  lines.push('    }')
  lines.push('    Views: {')
  for (const [name, table] of [...tables].sort()) {
    if (table.type !== 'VIEW') continue
    lines.push(`      ${name}: {`)
    lines.push('        Row: {')
    for (const c of table.columns) {
      lines.push(`          ${c.column_name}: ${tsType(c.udt, enums)}${c.nullable ? ' | null' : ''}`)
    }
    lines.push('        }')
    lines.push('        Relationships: []')
    lines.push('      }')
  }
  lines.push('    }')
  lines.push('    Functions: {')
  const emitted = new Set()
  for (const fn of functions) {
    if (emitted.has(fn.name)) continue
    emitted.add(fn.name)
    lines.push(`      ${fn.name}: {`)
    lines.push(`        Args: ${argsType(fn.args, enums)}`)
    lines.push(`        Returns: ${returnsType(fn.result, enums)}`)
    lines.push('      }')
  }
  lines.push('    }')
  lines.push('    Enums: Enums')
  lines.push('    CompositeTypes: Record<string, never>')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('export type Tables<T extends keyof Database[\'public\'][\'Tables\']> =')
  lines.push('  Database[\'public\'][\'Tables\'][T][\'Row\']')
  lines.push('export type TablesInsert<T extends keyof Database[\'public\'][\'Tables\']> =')
  lines.push('  Database[\'public\'][\'Tables\'][T][\'Insert\']')
  lines.push('export type TablesUpdate<T extends keyof Database[\'public\'][\'Tables\']> =')
  lines.push('  Database[\'public\'][\'Tables\'][T][\'Update\']')
  lines.push('export type Views<T extends keyof Database[\'public\'][\'Views\']> =')
  lines.push('  Database[\'public\'][\'Views\'][T][\'Row\']')
  lines.push('')

  await writeFile(outFile, lines.join('\n'), 'utf8')
  console.log(`Tipi generati: ${path.relative(process.cwd(), outFile)} (${tables.size} relazioni, ${enums.size} enum)`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
