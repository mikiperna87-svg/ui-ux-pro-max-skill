/**
 * Sostituto del pacchetto `server-only` per i test.
 *
 * In produzione quel pacchetto non fa nulla sul server e fa fallire la
 * compilazione se un modulo server finisce in un bundle del browser: è una
 * guardia di build, non codice che gira. Vitest però non è né l'uno né
 * l'altro ambiente, e l'import fallirebbe. Qui si replica esattamente il
 * comportamento lato server — un modulo vuoto — così i moduli server si
 * possono verificare per quello che fanno.
 */
export {}
