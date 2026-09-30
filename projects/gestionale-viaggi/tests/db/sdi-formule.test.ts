import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { imponibileRiga, ivaRiga, type RigaFattura } from '@/lib/sdi/riepilogo'

/**
 * La stessa IVA, calcolata due volte in due linguaggi.
 *
 * Il database la scorpora in `app.line_vat_cents`, per i registri e per la
 * scheda della fattura; il generatore del file XML la riscrive in TypeScript,
 * perché deve girare anche senza database. Due formule per lo stesso numero
 * sono una divergenza in attesa di succedere — e la divergenza sarebbe fra un
 * documento fiscale e la sua copia telematica.
 *
 * Questo test le mette una contro l'altra su una griglia di casi: importi
 * tondi, importi che cadono male sull'arrotondamento, aliquote diverse,
 * quantità maggiori di uno.
 */
const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

let client: pg.Client

beforeAll(async () => {
  client = new pg.Client({ connectionString })
  await client.connect()
}, 30_000)

afterAll(async () => {
  await client?.end()
})

const IMPORTI = [0, 1, 99, 100, 3333, 10_000, 31_625, 81_967, 99_999, 123_456, 1_000_000]
const ALIQUOTE = [0, 400, 1000, 2200]
const QUANTITA = [1, 2, 3, 7]

async function ivaSulDatabase(
  lordo: number,
  aliquota: number,
  regime: string,
): Promise<{ iva: number; imponibile: number }> {
  const esito = await client.query<{ iva: string; imponibile: string }>(
    `select app.line_vat_cents($1, 0, $2, $3::app.vat_regime)::text as iva,
            app.line_taxable_cents($1, 0, $2, $3::app.vat_regime)::text as imponibile`,
    [lordo, aliquota, regime],
  )
  return {
    iva: Number(esito.rows[0]?.iva ?? 0),
    imponibile: Number(esito.rows[0]?.imponibile ?? 0),
  }
}

describe('scorporo dell’IVA: TypeScript contro Postgres', () => {
  it('dà lo stesso risultato su tutta la griglia, in regime ordinario', async () => {
    const divergenze: string[] = []

    for (const importo of IMPORTI) {
      for (const aliquota of ALIQUOTE) {
        for (const quantita of QUANTITA) {
          const riga: RigaFattura = {
            descrizione: 'x',
            quantita,
            prezzoUnitarioCentesimi: importo,
            regime: 'ordinaria',
            aliquotaBps: aliquota,
          }
          const lordo = importo * quantita
          const { iva, imponibile } = await ivaSulDatabase(lordo, aliquota, 'ordinaria')
          if (ivaRiga(riga) !== iva) {
            divergenze.push(`IVA ${lordo}@${aliquota}: TS ${ivaRiga(riga)} ≠ SQL ${iva}`)
          }
          if (imponibileRiga(riga) !== imponibile) {
            divergenze.push(
              `imponibile ${lordo}@${aliquota}: TS ${imponibileRiga(riga)} ≠ SQL ${imponibile}`,
            )
          }
        }
      }
    }

    expect(divergenze).toEqual([])
  }, 60_000)

  // Fuori dal regime ordinario il file XML non espone IVA: l'imponibile
  // dichiarato è il corrispettivo intero. Sul 74-ter il database calcola invece
  // l'IVA sul margine, che è un'altra cosa e riguarda i registri dell'agenzia.
  it('fuori dal regime ordinario dichiara il corrispettivo e nessuna imposta', () => {
    for (const regime of ['art_74_ter', 'esente_art_10', 'fuori_campo', 'reverse_charge'] as const) {
      const riga: RigaFattura = {
        descrizione: 'x',
        quantita: 2,
        prezzoUnitarioCentesimi: 50_000,
        regime,
        aliquotaBps: 2200,
      }
      expect(ivaRiga(riga)).toBe(0)
      expect(imponibileRiga(riga)).toBe(100_000)
    }
  })
})
