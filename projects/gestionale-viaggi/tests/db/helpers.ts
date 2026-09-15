import pg from 'pg'

export const AGENCY_A = '11111111-1111-4111-8111-111111111111'
export const AGENCY_B = '33333333-3333-4333-8333-333333333333'

export const USER_A_OWNER = '22222222-2222-4222-8222-222222222221'
export const USER_A_ADMIN = '22222222-2222-4222-8222-222222222222'
export const USER_A_OPERATOR = '22222222-2222-4222-8222-222222222223'
export const USER_A_READONLY = '22222222-2222-4222-8222-222222222224'
export const USER_B_OWNER = '44444444-4444-4444-8444-444444444441'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'

/** Client con pieni poteri: serve solo a preparare le fixture. */
export async function adminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  return client
}

export interface Session {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ) => Promise<pg.QueryResult<T>>
}

/**
 * Esegue del codice impersonando un utente autenticato, esattamente come farebbe
 * PostgREST: ruolo `authenticated` + claim JWT sulla connessione. Tutto avviene
 * in una transazione che viene sempre annullata, cosi' i test non si sporcano
 * a vicenda.
 */
export async function asUser<T>(
  userId: string | null,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query('begin')
    if (userId) {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
      await client.query('set local role authenticated')
    } else {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ role: 'anon' }),
      ])
      await client.query('set local role anon')
    }
    return await fn({ query: (sql, params) => client.query(sql, params) })
  } finally {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  }
}

/** Prepara la seconda agenzia e l'utente in sola lettura usati dai test di isolamento. */
export async function seedTenants(): Promise<void> {
  const client = await adminClient()
  try {
    await client.query(`
      delete from public.agencies where id = '${AGENCY_B}';
      delete from auth.users where id in ('${USER_B_OWNER}', '${USER_A_READONLY}');

      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data)
      values
        ('00000000-0000-0000-0000-000000000000', '${USER_B_OWNER}', 'authenticated', 'authenticated',
         'titolare@viaggidelsud.it', crypt('Gestionale2026!', gen_salt('bf')), now(),
         '{"provider":"email"}'::jsonb, '{"full_name":"Rocco Esposito"}'::jsonb),
        ('00000000-0000-0000-0000-000000000000', '${USER_A_READONLY}', 'authenticated', 'authenticated',
         'revisore@orizzontiviaggi.it', crypt('Gestionale2026!', gen_salt('bf')), now(),
         '{"provider":"email"}'::jsonb, '{"full_name":"Enrico Pavan"}'::jsonb);

      insert into public.agencies (id, name, legal_name, vat_number, city, province, email, created_by)
      values ('${AGENCY_B}', 'Viaggi del Sud', 'Viaggi del Sud S.r.l.', 'IT07788990721',
              'Bari', 'BA', 'info@viaggidelsud.it', '${USER_B_OWNER}');

      insert into public.agency_settings (agency_id, created_by)
      values ('${AGENCY_B}', '${USER_B_OWNER}');

      insert into public.memberships (agency_id, user_id, role, full_name, email, created_by)
      values
        ('${AGENCY_B}', '${USER_B_OWNER}', 'titolare', 'Rocco Esposito', 'titolare@viaggidelsud.it', '${USER_B_OWNER}'),
        ('${AGENCY_A}', '${USER_A_READONLY}', 'sola_lettura', 'Enrico Pavan', 'revisore@orizzontiviaggi.it', '${USER_A_OWNER}');

      insert into public.customers (agency_id, kind, first_name, last_name, email, created_by)
      values ('${AGENCY_B}', 'privato', 'Nicola', 'Palumbo', 'nicola.palumbo@example.it', '${USER_B_OWNER}');
    `)
  } finally {
    await client.end()
  }
}
