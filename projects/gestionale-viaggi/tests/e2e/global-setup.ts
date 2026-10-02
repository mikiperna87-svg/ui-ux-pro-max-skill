import { config } from 'dotenv'
import pg from 'pg'

config({ path: '.env.test', quiet: true })
config({ path: '.env.local', quiet: true })

/**
 * Azzera le finestre del limitatore di richieste prima della suite: i test
 * aprono molte sessioni di fila dallo stesso indirizzo e verrebbero bloccati
 * dalla protezione che, in produzione, deve invece restare attiva.
 *
 * Se il database non è raggiungibile la suite prosegue: i percorsi pubblici
 * non ne hanno bisogno.
 */
export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) return

  const client = new pg.Client({ connectionString })
  try {
    await client.connect()
    await client.query('delete from public.rate_limits')
  } catch {
    // Nessun database: i test pubblici girano comunque.
  } finally {
    await client.end().catch(() => undefined)
  }
}
