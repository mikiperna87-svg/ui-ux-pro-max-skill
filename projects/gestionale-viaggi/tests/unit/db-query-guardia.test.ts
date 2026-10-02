import { describe, expect, it } from 'vitest'
// @ts-expect-error — lo script è JavaScript senza tipi: qui serve la sua logica.
import { soloLettura } from '../../scripts/db-query-api.mjs'

/**
 * La guardia di `db-query-api.mjs`.
 *
 * È l'unica cosa che sta fra un comando scritto in fretta e il database di
 * produzione, dove una scrittura sbagliata non si annulla. Il caso che conta
 * davvero è `explain analyze`: davanti a una `select` misura un piano e non
 * scrive niente, davanti a una `insert` scrive per davvero — e distinguerli
 * richiede di togliere il prefisso e guardare che cosa c'è sotto.
 */
describe('letture riconosciute', () => {
  for (const sql of [
    'select 1',
    'SELECT * FROM public.invoices',
    'with a as (select 1) select * from a',
    '  -- un commento\n  select 2',
    '/* blocco */ select 3',
    'explain select * from public.invoices',
    'explain analyze select * from public.invoices',
    'EXPLAIN (ANALYZE, BUFFERS) SELECT 1',
    'explain (analyze, format json) select 1',
    'explain analyse verbose select 1',
    'table public.plans',
    'values (1), (2)',
  ]) {
    it(JSON.stringify(sql), () => expect(soloLettura(sql)).toBe(true))
  }
})

describe('scritture respinte', () => {
  for (const sql of [
    'update public.invoices set status = 1',
    'delete from public.invoices',
    'insert into public.invoices values (1)',
    'drop table public.invoices',
    'alter table public.invoices add column x int',
    'truncate public.invoices',
    'grant select on public.invoices to anon',
    'refresh materialized view v',
    'vacuum full',
    'call qualcosa()',
    'do $$ begin end $$',
    // Il prefisso non assolve ciò che segue.
    'explain analyze insert into public.invoices values (1)',
    'explain (analyze) update public.invoices set status = 1',
    'explain analyze delete from public.invoices',
    // Due istruzioni in una: la seconda non si vede nella prima parola.
    'select 1; drop table public.invoices',
    // Un commento non nasconde una scrittura.
    '-- select\nupdate public.invoices set status = 1',
  ]) {
    it(JSON.stringify(sql), () => expect(soloLettura(sql)).toBe(false))
  }
})
