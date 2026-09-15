/**
 * Aritmetica monetaria.
 *
 * Regola assoluta del progetto: gli importi viaggiano e vengono salvati come
 * numeri INTERI di centesimi (bigint su Postgres). Qui non esiste alcun calcolo
 * in virgola mobile: ogni moltiplicazione/divisione passa da BigInt, così'
 * 0.1 + 0.2 non può' mai diventare 0.30000000000000004 su una fattura.
 *
 * Le aliquote e le percentuali si esprimono in PUNTI BASE (bps) interi:
 *   22%    -> 2200 bps
 *   10%    -> 1000 bps
 *   12,5%  -> 1250 bps
 */

/** Importo in centesimi interi. */
export type Cents = number

export const BPS_DENOMINATOR = 10_000n

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/** Verifica che un valore sia un numero intero di centesimi utilizzabile. */
export function assertCents(value: number, field = 'importo'): Cents {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new MoneyError(`Valore non valido per ${field}: attesi centesimi interi, ricevuto ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`Valore fuori scala per ${field}: ${value}`)
  }
  return value
}

/** Moltiplicazione e divisione esatte con arrotondamento commerciale (half-up, via BigInt). */
export function mulDivRoundHalfUp(value: bigint, multiplier: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new MoneyError('Divisione per zero nel calcolo monetario')
  const product = value * multiplier
  const negative = product < 0n !== divisor < 0n
  const absProduct = product < 0n ? -product : product
  const absDivisor = divisor < 0n ? -divisor : divisor
  const quotient = absProduct / absDivisor
  const remainder = absProduct % absDivisor
  const rounded = remainder * 2n >= absDivisor ? quotient + 1n : quotient
  return negative ? -rounded : rounded
}

/** Applica una percentuale espressa in punti base a un importo in centesimi. */
export function applyRateBps(amount: Cents, bps: number): Cents {
  assertCents(amount)
  if (!Number.isInteger(bps)) throw new MoneyError(`Aliquota non intera: ${bps} bps`)
  return Number(mulDivRoundHalfUp(BigInt(amount), BigInt(bps), BPS_DENOMINATOR))
}

/** IVA calcolata su un imponibile (prezzo al netto). */
export function vatFromNet(netAmount: Cents, vatBps: number): Cents {
  return applyRateBps(netAmount, vatBps)
}

/** Imponibile estratto da un importo lordo (scorporo). */
export function netFromGross(grossAmount: Cents, vatBps: number): Cents {
  assertCents(grossAmount)
  if (!Number.isInteger(vatBps) || vatBps < 0) throw new MoneyError(`Aliquota non valida: ${vatBps} bps`)
  return Number(
    mulDivRoundHalfUp(BigInt(grossAmount), BPS_DENOMINATOR, BPS_DENOMINATOR + BigInt(vatBps)),
  )
}

/** IVA contenuta in un importo lordo (scorporo). */
export function vatFromGross(grossAmount: Cents, vatBps: number): Cents {
  return assertCents(grossAmount) - netFromGross(grossAmount, vatBps)
}

/** Somma di importi in centesimi, esatta e con controllo di scala. */
export function sumCents(values: readonly Cents[]): Cents {
  const total = values.reduce<bigint>((acc, value) => acc + BigInt(assertCents(value)), 0n)
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(-Number.MAX_SAFE_INTEGER)) {
    throw new MoneyError('Somma fuori scala')
  }
  return Number(total)
}

/**
 * Ripartisce un importo in n quote senza perdere centesimi: la differenza di
 * arrotondamento viene distribuita sulle prime quote (metodo "largest remainder").
 */
export function splitEvenly(amount: Cents, parts: number): Cents[] {
  assertCents(amount)
  if (!Number.isInteger(parts) || parts <= 0) throw new MoneyError(`Numero di quote non valido: ${parts}`)
  const base = Math.trunc(amount / parts)
  const remainder = amount - base * parts
  const step = remainder >= 0 ? 1 : -1
  const absRemainder = Math.abs(remainder)
  return Array.from({ length: parts }, (_unused, index) => base + (index < absRemainder ? step : 0))
}

/** Ripartisce un importo secondo pesi interi, senza perdere centesimi. */
export function splitByWeights(amount: Cents, weights: readonly number[]): Cents[] {
  assertCents(amount)
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0)
  if (weights.length === 0 || totalWeight <= 0) throw new MoneyError('Pesi non validi per la ripartizione')
  const shares = weights.map((weight) =>
    Number(mulDivRoundHalfUp(BigInt(amount), BigInt(Math.round(weight * 1_000_000)), BigInt(Math.round(totalWeight * 1_000_000)))),
  )
  const drift = amount - shares.reduce((acc, share) => acc + share, 0)
  if (drift !== 0) {
    const step = drift > 0 ? 1 : -1
    for (let index = 0; index < Math.abs(drift); index += 1) {
      const target = index % shares.length
      shares[target] = (shares[target] ?? 0) + step
    }
  }
  return shares
}

/** Percentuale in punti base di una parte rispetto a un totale (0 se totale nullo). */
export function ratioBps(part: Cents, total: Cents): number {
  assertCents(part)
  assertCents(total)
  if (total === 0) return 0
  return Number(mulDivRoundHalfUp(BigInt(part), BPS_DENOMINATOR, BigInt(total)))
}

const euroFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // CLDR italiano ometterebbe il punto nelle migliaia a 4 cifre (1234,56):
  // in un gestionale contabile la separazione deve esserci sempre.
  // Il cast serve finche' la libreria di tipi di TypeScript dichiara
  // useGrouping come booleano (ECMA-402 ammette anche 'always').
  useGrouping: 'always',
} as Intl.NumberFormatOptions & { useGrouping: string })

const euroCompactFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export interface FormatEuroOptions {
  /** Mostra sempre il segno, anche per i positivi (utile nei movimenti). */
  readonly signed?: boolean
  /** Notazione compatta per i KPI (1,2 Mln €). */
  readonly compact?: boolean
}

/** Unico formattatore di importi dell’applicazione: centesimi -> "1.234,56 €". */
export function formatEuro(amount: Cents, options: FormatEuroOptions = {}): string {
  assertCents(amount)
  const value = amount / 100
  const formatter = options.compact ? euroCompactFormatter : euroFormatter
  const formatted = formatter.format(value)
  if (options.signed && amount > 0) return `+${formatted}`
  return formatted
}

/** Percentuale da punti base: 1875 -> "18,75%". */
export function formatPercent(bps: number, fractionDigits = 2): string {
  if (!Number.isFinite(bps)) return '—'
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(bps / 10_000)
}

/**
 * Converte un importo digitato dall’utente in centesimi interi.
 * Accetta "1.234,56", "1234,56", "1234.56", "1 234,56", "€ 1.234,56".
 */
export function parseAmountToCents(input: string): Cents {
  const cleaned = input
    .replace(/[\s €]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  if (cleaned === '' || cleaned === '-') throw new MoneyError('Importo mancante')
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new MoneyError(`Formato importo non valido: "${input}"`)
  }
  const negative = cleaned.startsWith('-')
  const [wholePart = '0', decimalPart = ''] = cleaned.replace('-', '').split('.')
  const cents = BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'))
  const value = Number(negative ? -cents : cents)
  return assertCents(value)
}

/** Converte centesimi nel valore decimale da mostrare in un campo numerico. */
export function centsToInputValue(amount: Cents): string {
  assertCents(amount)
  const negative = amount < 0
  const abs = Math.abs(amount)
  return `${negative ? '-' : ''}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}
