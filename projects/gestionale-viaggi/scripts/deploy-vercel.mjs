#!/usr/bin/env node
/**
 * Pubblica il gestionale su Vercel caricando i file direttamente, senza
 * passare dall'integrazione GitHub.
 *
 *   VERCEL_TOKEN=... node scripts/deploy-vercel.mjs --nome gestionale-viaggi
 *
 * --nome <nome>   nome del progetto Vercel (default: gestionale-viaggi)
 * --team <id>     identificativo del team, se il progetto non è personale
 * --anteprima     pubblica come anteprima invece che in produzione
 * --prova         elenca i file che verrebbero caricati e si ferma
 *
 * Vengono caricati soltanto i file tracciati da git: `git ls-files`. Così
 * node_modules, .next, .env.local e i risultati dei test restano fuori senza
 * bisogno di una seconda lista da tenere allineata.
 *
 * Le variabili d'ambiente NON le scrive questo comando: si impostano una volta
 * sola sul progetto (vedi README, «Pubblicare su Vercel»), perché contengono
 * chiavi e non devono finire in un file di questo repository.
 *
 * Le richieste passano da `curl` e non da fetch(): così il comando funziona
 * anche dietro un proxy aziendale.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const esegui = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const argv = process.argv.slice(2)
const args = new Set(argv)

function opzione(nome) {
  const i = argv.indexOf(nome)
  return i >= 0 ? argv[i + 1] : undefined
}

const nome = opzione('--nome') ?? 'gestionale-viaggi'
const team = opzione('--team') ?? process.env.VERCEL_TEAM_ID
const token = process.env.VERCEL_TOKEN
const base = process.env.VERCEL_API_URL ?? 'https://api.vercel.com'
const query = team ? `?teamId=${encodeURIComponent(team)}` : ''

const attesa = (ms) => new Promise((ok) => setTimeout(ok, ms))

/**
 * Una chiamata all'API di Vercel. Ritorna { stato, corpo }.
 *
 * `ripetibile` dice che rifare la stessa chiamata non produce un secondo
 * effetto: le letture, e il caricamento di un file, che e' indirizzato dal suo
 * digest e quindi riscrive lo stesso oggetto. Solo quelle vengono ritentate
 * dopo un 5xx — l'API risponde 502 «upstream request failed» abbastanza spesso
 * da fermare un rilascio per niente. La creazione della pubblicazione no: un
 * ritentativo alla cieca ne aprirebbe due.
 */
async function chiama(metodo, percorso, { json, file, intestazioni = [], ripetibile = false } = {}) {
  const comando = [
    '-sS',
    '-X', metodo,
    '-w', '\n%{http_code}',
    ...(token ? ['-H', `Authorization: Bearer ${token}`] : []),
    ...intestazioni.flatMap((h) => ['-H', h]),
  ]
  if (json !== undefined) {
    comando.push('-H', 'Content-Type: application/json', '--data-binary', JSON.stringify(json))
  }
  if (file !== undefined) {
    comando.push('--data-binary', `@${file}`)
  }
  comando.push(`${base}${percorso}`)

  let esito
  for (let tentativo = 0; ; tentativo += 1) {
    const { stdout } = await esegui('curl', comando, { maxBuffer: 64 * 1024 * 1024 })
    const taglio = stdout.lastIndexOf('\n')
    const testo = stdout.slice(0, taglio)
    const stato = Number(stdout.slice(taglio + 1).trim())
    let corpo = testo
    try {
      corpo = JSON.parse(testo)
    } catch {
      // Alcune risposte sono vuote: si tiene il testo.
    }
    esito = { stato, corpo }
    if (!ripetibile || stato < 500 || tentativo >= 3) break
    const pausa = 2000 * 2 ** tentativo
    console.log(`  · HTTP ${stato} su ${percorso}, riprovo fra ${pausa / 1000}s`)
    await attesa(pausa)
  }
  return esito
}

function errore(etichetta, { stato, corpo }) {
  const messaggio = corpo?.error?.message ?? corpo?.message ?? JSON.stringify(corpo)
  return new Error(`HTTP ${stato} su ${etichetta}\n${messaggio}`)
}

async function elencaFile() {
  const { stdout } = await esegui('git', ['ls-files'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  return stdout.split('\n').filter(Boolean).sort()
}

async function run() {
  const percorsi = await elencaFile()
  if (percorsi.length === 0) {
    throw new Error('git ls-files non ha restituito niente: il comando va lanciato dentro il repository.')
  }

  const file = []
  for (const relativo of percorsi) {
    const assoluto = path.join(root, relativo)
    const contenuto = await readFile(assoluto)
    const info = await stat(assoluto)
    file.push({
      relativo,
      assoluto,
      sha: createHash('sha1').update(contenuto).digest('hex'),
      size: info.size,
    })
  }

  const peso = file.reduce((somma, f) => somma + f.size, 0)
  console.log(`${file.length} file, ${(peso / 1024 / 1024).toFixed(2)} MB`)

  if (args.has('--prova')) {
    file.forEach((f) => console.log(`  ${f.relativo}`))
    return
  }

  // Il progetto: se esiste già si riusa, così le variabili d'ambiente
  // impostate a mano non vengono perse a ogni pubblicazione.
  const esistente = await chiama('GET', `/v9/projects/${encodeURIComponent(nome)}${query}`, {
    ripetibile: true,
  })
  if (esistente.stato === 404) {
    const creato = await chiama('POST', `/v10/projects${query}`, {
      json: { name: nome, framework: 'nextjs' },
    })
    if (creato.stato >= 300) throw errore('creazione del progetto', creato)
    console.log(`· progetto creato: ${creato.corpo.name}`)
  } else if (esistente.stato >= 300) {
    throw errore('lettura del progetto', esistente)
  } else {
    console.log(`· progetto già presente: ${esistente.corpo.name}`)
  }

  for (const f of file) {
    const caricato = await chiama('POST', `/v2/files${query}`, {
      file: f.assoluto,
      intestazioni: [
        `x-vercel-digest: ${f.sha}`,
        `Content-Length: ${f.size}`,
        'Content-Type: application/octet-stream',
      ],
      ripetibile: true,
    })
    if (caricato.stato >= 300) throw errore(`caricamento di ${f.relativo}`, caricato)
  }
  console.log(`· ${file.length} file caricati`)

  const pubblicazione = await chiama('POST', `/v13/deployments${query}`, {
    json: {
      name: nome,
      project: nome,
      target: args.has('--anteprima') ? 'preview' : 'production',
      files: file.map((f) => ({ file: f.relativo, sha: f.sha, size: f.size })),
      projectSettings: { framework: 'nextjs' },
    },
  })
  if (pubblicazione.stato >= 300) throw errore('creazione della pubblicazione', pubblicazione)

  const { id, url } = pubblicazione.corpo
  console.log(`· pubblicazione avviata: ${id}`)
  console.log(`\nIndirizzo: https://${url}`)
  console.log(`Stato:     node scripts/deploy-vercel.mjs --stato ${id}`)
}

/** Legge lo stato di una pubblicazione già avviata. */
async function stato(id) {
  const risposta = await chiama('GET', `/v13/deployments/${id}${query}`, { ripetibile: true })
  if (risposta.stato >= 300) throw errore('lettura della pubblicazione', risposta)
  const { readyState, url, errorMessage } = risposta.corpo
  console.log(`${readyState}  https://${url}`)
  if (errorMessage) console.log(errorMessage)
}

const idStato = opzione('--stato')
const compito = idStato ? stato(idStato) : run()
compito.catch((err) => {
  console.error(`\n✖ ${err.message}`)
  process.exit(1)
})
