import { describe, expect, it } from 'vitest'
import { firma, TOLLERANZA_SECONDI, verificaFirma } from '@/lib/webhook-firma'

const SEGRETO = 'un-segreto-qualunque'
const CORPO = '{"agency_id":"aaaa","status":"attivo"}'
const ADESSO = 1_800_000_000

describe('firma dei webhook', () => {
  it('accetta una firma giusta', () => {
    const f = firma(CORPO, SEGRETO, ADESSO)
    expect(verificaFirma(CORPO, f, SEGRETO, ADESSO)).toEqual({ valida: true })
  })

  it('rifiuta un corpo cambiato di un carattere', () => {
    const f = firma(CORPO, SEGRETO, ADESSO)
    const esito = verificaFirma(`${CORPO} `, f, SEGRETO, ADESSO)
    expect(esito.valida).toBe(false)
  })

  it('rifiuta un segreto diverso', () => {
    const f = firma(CORPO, 'altro-segreto', ADESSO)
    expect(verificaFirma(CORPO, f, SEGRETO, ADESSO).valida).toBe(false)
  })

  // Senza il controllo sull'orario una richiesta intercettata varrebbe per
  // sempre: è la differenza fra una firma e un lasciapassare.
  it('rifiuta una richiesta più vecchia della tolleranza', () => {
    const f = firma(CORPO, SEGRETO, ADESSO)
    const esito = verificaFirma(CORPO, f, SEGRETO, ADESSO + TOLLERANZA_SECONDI + 1)
    expect(esito).toEqual({ valida: false, motivo: 'Richiesta troppo vecchia o con orario sbagliato' })
  })

  it('accetta una richiesta al limite della tolleranza', () => {
    const f = firma(CORPO, SEGRETO, ADESSO)
    expect(verificaFirma(CORPO, f, SEGRETO, ADESSO + TOLLERANZA_SECONDI).valida).toBe(true)
  })

  it('rifiuta un orario nel futuro oltre la tolleranza', () => {
    const f = firma(CORPO, SEGRETO, ADESSO + TOLLERANZA_SECONDI + 60)
    expect(verificaFirma(CORPO, f, SEGRETO, ADESSO).valida).toBe(false)
  })

  it('rifiuta l’assenza di firma e le firme malformate', () => {
    expect(verificaFirma(CORPO, null, SEGRETO, ADESSO)).toEqual({ valida: false, motivo: 'Firma assente' })
    expect(verificaFirma(CORPO, 'ciao', SEGRETO, ADESSO).valida).toBe(false)
    expect(verificaFirma(CORPO, 't=1,v1=zz', SEGRETO, ADESSO).valida).toBe(false)
  })

  // Senza segreto configurato l'endpoint non deve diventare aperto: deve
  // chiudersi.
  it('senza segreto sul server rifiuta tutto', () => {
    const f = firma(CORPO, SEGRETO, ADESSO)
    expect(verificaFirma(CORPO, f, '', ADESSO)).toEqual({
      valida: false,
      motivo: 'Nessun segreto configurato sul server',
    })
  })
})
