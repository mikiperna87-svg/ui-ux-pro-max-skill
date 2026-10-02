import { Font } from '@react-pdf/renderer'
import path from 'node:path'

/**
 * Il carattere dei documenti PDF.
 *
 * I font standard del formato PDF — Helvetica e famiglia — usano la codifica
 * del 1985: non contengono il simbolo dell'euro né l'apostrofo tipografico, e
 * react-pdf li lascia cadere senza dire niente. Un documento fiscale senza il
 * segno € non è un'opzione, quindi i PDF portano con sé Inter (SIL Open Font
 * License), lo stesso carattere dell'applicazione, in due pesi.
 *
 * I file vengono letti dal disco: `outputFileTracingIncludes` in next.config.ts
 * li tiene dentro il pacchetto delle funzioni anche in produzione, dove il
 * contenuto di `public/` non è disponibile al codice server.
 */
export const FAMIGLIA_PDF = 'Inter'

const CARTELLA = path.join(process.cwd(), 'src/server/pdf/fonts')

Font.register({
  family: FAMIGLIA_PDF,
  fonts: [
    { src: path.join(CARTELLA, 'Inter-Regular.ttf'), fontWeight: 400 },
    { src: path.join(CARTELLA, 'Inter-SemiBold.ttf'), fontWeight: 600 },
  ],
})

// Spezzare "Zanzibar" a metà riga su un preventivo fa un'impressione pessima, e
// su una fattura anche peggio: la sillabazione automatica resta spenta.
Font.registerHyphenationCallback((parola) => [parola])
