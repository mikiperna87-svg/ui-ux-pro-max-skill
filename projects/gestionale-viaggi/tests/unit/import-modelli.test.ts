import { describe, expect, it } from 'vitest'
import { matchHeader, parseCsv } from '@/lib/csv'
import { buildRowValues, mapHeaders } from '@/lib/import-maps'
import { IMPORT_DEFINITIONS, templateCsv, type ImportEntity } from '@/lib/import-registry'

/**
 * Il modello scaricabile deve tornare indietro.
 *
 * Ogni rotta `/<entità>/modello` stampa come intestazione l'etichetta del
 * campo. Se quell'etichetta non è fra i nomi riconosciuti, la colonna viene
 * ignorata in silenzio: l'agenzia compila il nostro stesso file, lo ricarica e
 * si ritrova i dati a metà senza un messaggio d'errore. È già capitato con
 * "Tipo di vendita", "Data di nascita", "Luogo di nascita" e "Giorni di
 * pagamento", e vale per tutte le entità presenti e future.
 */
const entità = Object.keys(IMPORT_DEFINITIONS) as ImportEntity[]

const canonico = (valore: string) =>
  valore
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

describe.each(entità)('modello di %s', (entità) => {
  const campi = IMPORT_DEFINITIONS[entità].fields
  const intestazioni = campi.map((campo) => campo.label)

  it('riconosce ogni intestazione che stampa', () => {
    const mappature = mapHeaders(intestazioni, campi)
    for (const campo of campi) {
      const mappatura = mappature.find((voce) => voce.field === campo.field)
      expect(mappatura?.header, campo.label).toBe(campo.label)
    }
  })

  it('non stampa due volte la stessa intestazione', () => {
    expect(new Set(intestazioni).size).toBe(intestazioni.length)
  })

  // Due campi che rivendicano lo stesso nome si rubano la colonna a vicenda, e
  // quale dei due vince dipende dall'ordine delle intestazioni nel file.
  it('non ha due campi che rivendicano lo stesso nome', () => {
    const proprietario = new Map<string, string>()
    for (const campo of campi) {
      for (const nome of [campo.field, ...campo.aliases, campo.label]) {
        const chiave = canonico(nome)
        const già = proprietario.get(chiave)
        expect(già ?? campo.field, `"${nome}"`).toBe(campo.field)
        proprietario.set(chiave, campo.field)
      }
    }
  })

  // Un campo obbligatorio che il modello non dichiara condanna il file.
  it('dichiara nel modello tutti i campi obbligatori', () => {
    for (const campo of campi.filter((voce) => voce.required)) {
      expect(matchHeader(intestazioni, [campo.field, ...campo.aliases, campo.label]), campo.label)
        .not.toBeNull()
    }
  })
})

/**
 * La prova che conta: il modello generato, riletto dal nostro stesso lettore e
 * validato dallo schema dell'entità. Se questa cade, l'agenzia che scarica il
 * modello, lo compila e lo ricarica vede righe scartate senza capire perché.
 */
describe.each(entità)('il modello di %s si reimporta', (entità) => {
  const definizione = IMPORT_DEFINITIONS[entità]

  it('si rilegge e supera la validazione', () => {
    const letto = parseCsv(templateCsv(entità))
    expect(letto.rows.length).toBe(definizione.examples.length)

    const mappature = mapHeaders(letto.headers, definizione.fields)
    for (const campo of definizione.fields.filter((voce) => voce.required)) {
      expect(
        mappature.find((voce) => voce.field === campo.field)?.header,
        campo.label,
      ).not.toBeNull()
    }

    letto.rows.forEach((riga, indice) => {
      const valori = buildRowValues(riga, definizione.fields, mappature)
      const esito = definizione.schema.safeParse(valori)
      expect(
        esito.success,
        esito.success
          ? ''
          : `riga ${indice + 1}: ${esito.error.issues.map((problema) => `${problema.path.join('.')} ${problema.message}`).join('; ')}`,
      ).toBe(true)
    })
  })

  // Un esempio che cita una colonna inesistente non finisce nel file: resta un
  // valore scritto a mano che nessuno legge, e il modello esce incompleto.
  it('non ha esempi su colonne che il modello non stampa', () => {
    const etichette = new Set(definizione.fields.map((campo) => campo.label))
    for (const esempio of definizione.examples) {
      for (const colonna of Object.keys(esempio)) {
        expect(etichette.has(colonna), colonna).toBe(true)
      }
    }
  })
})
