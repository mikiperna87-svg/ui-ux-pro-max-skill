#!/usr/bin/env node
/**
 * Banco di prova locale: espone su http://127.0.0.1:54321 la stessa superficie
 * HTTP che l'applicazione usa su Supabase (autenticazione GoTrue + PostgREST),
 * appoggiandosi al Postgres locale con le migrazioni reali.
 *
 * NON fa parte del prodotto e non viene mai distribuito: serve a sviluppare e a
 * eseguire i test end-to-end su questa macchina, dove non e' disponibile Docker
 * per lanciare Supabase. Le policy RLS che si attraversano qui sono quelle vere,
 * perche' ogni richiesta viene eseguita con `set local role authenticated` e i
 * claim JWT impostati sulla connessione, esattamente come fa PostgREST.
 *
 *   node supabase/testing/local-api.mjs
 */
import crypto from 'node:crypto'
import http from 'node:http'
import pg from 'pg'

const PORT = Number(process.env.LOCAL_API_PORT ?? 54321)
const CONNECTION =
  process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:54329/postgres'
const JWT_SECRET = process.env.LOCAL_API_JWT_SECRET ?? 'segreto-di-sviluppo-locale-non-usare-altrove'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'chiave-di-servizio-di-sviluppo-locale-0000'

// PostgREST restituisce i bigint come numeri JSON: qui facciamo lo stesso,
// altrimenti il banco di prova si comporterebbe diversamente dalla produzione.
pg.types.setTypeParser(20, (value) => Number(value))

const pool = new pg.Pool({ connectionString: CONNECTION, max: 24, idleTimeoutMillis: 10_000 })
const refreshTokens = new Map()

// --- JWT minimale (HS256) ----------------------------------------------------
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

function signJwt(payload) {
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode(payload)
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJwt(token) {
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) return null
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  if (expected !== signature) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (payload.exp && payload.exp * 1000 < Date.now()) return null
  return payload
}

// --- Esecuzione con identita' -------------------------------------------------
/**
 * Esegue una query con il ruolo e i claim dell'utente: e' qui che la RLS entra
 * in gioco, come in produzione.
 */
async function runAs(claims, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (claims?.role === 'service_role') {
      // Il ruolo di servizio scavalca la RLS: restiamo sul ruolo proprietario.
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ role: 'service_role' }),
      ])
    } else {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify(claims ?? { role: 'anon' }),
      ])
      await client.query(`set local role ${claims?.sub ? 'authenticated' : 'anon'}`)
    }
    const result = await work(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

// --- Traduzione delle query PostgREST ----------------------------------------
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

function buildFilters(params, values) {
  const clauses = []
  for (const [column, raw] of params) {
    if (RESERVED.has(column)) continue
    const [operator, ...rest] = raw.split('.')
    const operand = rest.join('.')
    switch (operator) {
      case 'eq':
      case 'neq':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const sqlOperator = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator]
        values.push(operand)
        clauses.push(`"${column}" ${sqlOperator} $${values.length}`)
        break
      }
      case 'like':
      case 'ilike': {
        values.push(operand.replace(/\*/g, '%'))
        clauses.push(`"${column}"::text ${operator} $${values.length}`)
        break
      }
      case 'is': {
        clauses.push(`"${column}" is ${operand === 'null' ? 'null' : operand}`)
        break
      }
      case 'in': {
        const items = operand.replace(/^\(|\)$/g, '').split(',').filter(Boolean)
        const placeholders = items.map((item) => {
          values.push(item.replace(/^"|"$/g, ''))
          return `$${values.length}`
        })
        clauses.push(`"${column}" in (${placeholders.join(', ')})`)
        break
      }
      case 'not': {
        clauses.push(`"${column}" is not null`)
        break
      }
      default:
        break
    }
  }
  return clauses
}

function buildOrder(params) {
  const order = params.get('order')
  if (!order) return ''
  const parts = order.split(',').map((entry) => {
    const [column, ...modifiers] = entry.split('.')
    const direction = modifiers.includes('desc') ? 'desc' : 'asc'
    const nulls = modifiers.includes('nullsfirst')
      ? ' nulls first'
      : modifiers.includes('nullslast')
        ? ' nulls last'
        : ''
    return `"${column}" ${direction}${nulls}`
  })
  return ` order by ${parts.join(', ')}`
}

async function handleRest(request, response, url, claims, body) {
  const [, , , resource, ...extra] = url.pathname.split('/')
  const params = url.searchParams

  if (resource === 'rpc') {
    const fn = extra[0]
    const args = body ?? {}
    const names = Object.keys(args)
    const values = names.map((name) => args[name])
    const call = names.map((name, index) => `${name} => $${index + 1}`).join(', ')
    const rows = await runAs(claims, async (client) => {
      const result = await client.query(`select * from public.${fn}(${call})`, values)
      return result.rows
    })
    // Una funzione scalare restituisce il valore, non la riga che lo contiene.
    if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === fn) {
      return sendJson(response, 200, rows[0][fn], request)
    }
    return sendJson(response, 200, rows, request)
  }

  const table = resource
  const extraHeaders = {}
  const select = params.get('select') ?? '*'
  const columns = select === '*' ? '*' : select.split(',').map((c) => `"${c.trim()}"`).join(', ')
  const values = []
  const filters = buildFilters(params, values)
  const where = filters.length > 0 ? ` where ${filters.join(' and ')}` : ''
  const limit = params.get('limit') ? ` limit ${Number(params.get('limit'))}` : ''
  const offset = params.get('offset') ? ` offset ${Number(params.get('offset'))}` : ''
  const wantsObject = (request.headers.accept ?? '').includes('vnd.pgrst.object')
  const wantsRepresentation = (request.headers.prefer ?? '').includes('return=representation')
  // PostgREST comunica il totale nell'intestazione Content-Range quando il
  // client chiede Prefer: count=exact: senza questo la paginazione lato
  // server non saprebbe quante pagine esistono.
  const wantsCount = /count=(exact|planned|estimated)/.test(request.headers.prefer ?? '')

  let sql
  if (request.method === 'GET' || request.method === 'HEAD') {
    sql = `select ${columns} from public."${table}"${where}${buildOrder(params)}${limit}${offset}`
  } else if (request.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body]
    const keys = Object.keys(rows[0] ?? {})
    const tuples = rows.map(
      (row) => `(${keys.map((key) => {
        values.push(row[key])
        return `$${values.length}`
      }).join(', ')})`,
    )
    sql = `insert into public."${table}" (${keys.map((k) => `"${k}"`).join(', ')}) values ${tuples.join(', ')} returning *`
  } else if (request.method === 'PATCH') {
    const keys = Object.keys(body ?? {})
    const assignments = keys.map((key) => {
      values.push(body[key])
      return `"${key}" = $${values.length}`
    })
    sql = `update public."${table}" set ${assignments.join(', ')}${where} returning *`
  } else if (request.method === 'DELETE') {
    sql = `delete from public."${table}"${where} returning *`
  } else {
    return sendJson(response, 405, { message: 'Metodo non supportato' }, request)
  }

  try {
    let total = null
    const rows = await runAs(claims, async (client) => {
      if (wantsCount && (request.method === 'GET' || request.method === 'HEAD')) {
        const counted = await client.query(
          `select count(*)::bigint as total from public."${table}"${where}`,
          values,
        )
        total = Number(counted.rows[0]?.total ?? 0)
      }
      return (await client.query(sql, values)).rows
    })

    if (total !== null) {
      const first = params.get('offset') ? Number(params.get('offset')) : 0
      const last = Math.max(first + rows.length - 1, first)
      extraHeaders['content-range'] = `${first}-${last}/${total}`
    }

    if (wantsObject) {
      if (rows.length === 0) {
        return sendJson(response, 406, { code: 'PGRST116', message: 'Nessuna riga trovata' }, request)
      }
      return sendJson(response, 200, rows[0], request, extraHeaders)
    }
    if (request.method !== 'GET' && !wantsRepresentation) {
      return sendJson(response, 201, null, request, extraHeaders)
    }
    return sendJson(response, request.method === 'POST' ? 201 : 200, rows, request, extraHeaders)
  } catch (error) {
    const status = /row-level security|permission denied/i.test(error.message) ? 403 : 400
    return sendJson(
      response,
      status,
      { code: error.code ?? 'PGRST000', message: error.message, details: error.detail ?? null },
      request,
    )
  }
}

// --- Autenticazione -----------------------------------------------------------
function userPayload(row) {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    confirmed_at: row.email_confirmed_at,
    phone: '',
    app_metadata: row.raw_app_meta_data ?? { provider: 'email', providers: ['email'] },
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    is_anonymous: false,
  }
}

function sessionFor(user) {
  const now = Math.floor(Date.now() / 1000)
  const accessToken = signJwt({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
  })
  const refreshToken = crypto.randomBytes(24).toString('hex')
  refreshTokens.set(refreshToken, user.id)
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refreshToken,
    user,
  }
}

async function handleAuth(request, response, url, body) {
  const path = url.pathname.replace('/auth/v1', '')
  const admin = { role: 'service_role' }

  if (path === '/token' && request.method === 'POST') {
    const grant = url.searchParams.get('grant_type')

    if (grant === 'refresh_token') {
      const userId = refreshTokens.get(body?.refresh_token)
      if (!userId) return sendJson(response, 400, { error: 'invalid_grant' }, request)
      const rows = await runAs(admin, async (client) =>
        (await client.query('select * from auth.users where id = $1', [userId])).rows,
      )
      if (rows.length === 0) return sendJson(response, 400, { error: 'invalid_grant' }, request)
      return sendJson(response, 200, sessionFor(userPayload(rows[0])), request)
    }

    const rows = await runAs(admin, async (client) =>
      (
        await client.query(
          `select *, encrypted_password = crypt($2, encrypted_password) as valid
           from auth.users where lower(email) = lower($1)`,
          [body?.email ?? '', body?.password ?? ''],
        )
      ).rows,
    )

    if (rows.length === 0 || !rows[0].valid) {
      return sendJson(
        response,
        400,
        { error: 'invalid_grant', error_description: 'Invalid login credentials' },
        request,
      )
    }
    return sendJson(response, 200, sessionFor(userPayload(rows[0])), request)
  }

  if (path === '/user') {
    const token = (request.headers.authorization ?? '').replace('Bearer ', '')
    const claims = verifyJwt(token)
    if (!claims?.sub) {
      return sendJson(response, 401, { message: 'Sessione non valida' }, request)
    }

    if (request.method === 'PUT') {
      await runAs(admin, async (client) => {
        if (body?.password) {
          await client.query(
            'update auth.users set encrypted_password = crypt($2, gen_salt($3)), updated_at = now() where id = $1',
            [claims.sub, body.password, 'bf'],
          )
        }
      })
    }

    const rows = await runAs(admin, async (client) =>
      (await client.query('select * from auth.users where id = $1', [claims.sub])).rows,
    )
    if (rows.length === 0) return sendJson(response, 401, { message: 'Utente inesistente' }, request)
    return sendJson(response, 200, userPayload(rows[0]), request)
  }

  if (path === '/logout') {
    return sendJson(response, 204, null, request)
  }

  if (path === '/signup' && request.method === 'POST') {
    const rows = await runAs(admin, async (client) =>
      (
        await client.query(
          `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
           values (lower($1), crypt($2, gen_salt('bf')), now(), $3)
           on conflict (email) do nothing
           returning *`,
          [body?.email ?? '', body?.password ?? '', JSON.stringify(body?.data ?? {})],
        )
      ).rows,
    )
    if (rows.length === 0) {
      return sendJson(response, 422, { message: 'Indirizzo gia registrato' }, request)
    }
    return sendJson(response, 200, sessionFor(userPayload(rows[0])), request)
  }

  if (path === '/otp' || path === '/recover') {
    // In sviluppo non si spediscono email: il link comparirebbe qui.
    console.log(`[auth] richiesta ${path} per ${body?.email ?? 'sconosciuto'}`)
    return sendJson(response, 200, {}, request)
  }

  if (path === '/invite' && request.method === 'POST') {
    const rows = await runAs(admin, async (client) =>
      (
        await client.query(
          `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
           values (lower($1), now(), $2)
           on conflict (email) do update set updated_at = now()
           returning *`,
          [body?.email ?? '', JSON.stringify(body?.data ?? {})],
        )
      ).rows,
    )
    return sendJson(response, 200, { user: userPayload(rows[0]) }, request)
  }

  return sendJson(response, 404, { message: `Endpoint non implementato: ${path}` }, request)
}

// --- Server -------------------------------------------------------------------
function sendJson(response, status, payload, request, headers = {}) {
  const origin = request?.headers?.origin ?? '*'
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
    ...headers,
  })
  response.end(payload === null ? '' : JSON.stringify(payload))
}

function claimsFrom(request) {
  const header = request.headers.authorization ?? ''
  const token = header.replace('Bearer ', '').trim()
  if (!token) return { role: 'anon' }
  if (token === SERVICE_KEY) return { role: 'service_role' }
  return verifyJwt(token) ?? { role: 'anon' }
}

const server = http.createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', async () => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`)
    const raw = Buffer.concat(chunks).toString('utf8')
    let body = null
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = null
      }
    }

    if (request.method === 'OPTIONS') return sendJson(response, 204, null, request)

    try {
      if (url.pathname.startsWith('/auth/v1')) return await handleAuth(request, response, url, body)
      if (url.pathname.startsWith('/rest/v1')) {
        return await handleRest(request, response, url, claimsFrom(request), body)
      }
      return sendJson(response, 404, { message: 'Percorso sconosciuto' }, request)
    } catch (error) {
      console.error('[local-api]', error.message)
      return sendJson(response, 500, { message: error.message }, request)
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Banco di prova Supabase in ascolto su http://127.0.0.1:${PORT}`)
  console.log(`Database: ${CONNECTION}`)
})
