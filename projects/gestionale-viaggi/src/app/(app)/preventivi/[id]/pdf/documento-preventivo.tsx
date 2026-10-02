import { Document, type DocumentProps, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { formatDateLong, formatDateShort } from '@/lib/date'
import type { Enums, Tables } from '@/lib/database.types'
import { QUOTE_VARIANT, SERVICE_TYPE, plurale } from '@/lib/labels'
import { formatEuro } from '@/lib/money'
import { FAMIGLIA_PDF } from '@/server/pdf/caratteri'
import type { QuoteItemRow, QuoteVariantTotals } from '@/server/queries/preventivi'

type Variante = Enums['quote_variant']

const ORDINE: readonly Variante[] = ['base', 'consigliata', 'premium']

/**
 * Il PDF del preventivo.
 *
 * Non usa i token del design system perché non sono disponibili qui: il PDF
 * non è una pagina web, non ha temi e non ha un foglio di stile condiviso. I
 * colori sono i pochi che servono, scritti in chiaro e scelti perché reggono
 * anche la stampa in bianco e nero.
 */
const NERO = '#1d1c1a'
const GRIGIO = '#6b6862'
const LINEA = '#d9d5cd'
const SFONDO = '#f5f4f1'

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: FAMIGLIA_PDF,
    color: NERO,
    lineHeight: 1.45,
  },
  intestazione: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: LINEA,
    paddingBottom: 12,
    marginBottom: 18,
  },
  agenzia: { fontSize: 13, fontWeight: 600 },
  agenziaRiga: { fontSize: 8, color: GRIGIO },
  numero: { fontSize: 8, color: GRIGIO, textAlign: 'right' },
  numeroForte: { fontSize: 11, fontWeight: 600, textAlign: 'right' },
  titolo: { fontSize: 17, fontWeight: 600, marginBottom: 4 },
  sottotitolo: { fontSize: 9.5, color: GRIGIO, marginBottom: 14 },
  intro: { marginBottom: 16 },
  sezione: { fontSize: 11, fontWeight: 600, marginBottom: 8, marginTop: 4 },
  proposta: {
    borderWidth: 1,
    borderColor: LINEA,
    borderRadius: 4,
    marginBottom: 12,
  },
  propostaTesta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: SFONDO,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINEA,
  },
  propostaNome: { fontSize: 11, fontWeight: 600 },
  propostaNota: { fontSize: 8, color: GRIGIO },
  riga: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: LINEA,
  },
  rigaDescrizione: { flex: 1, paddingRight: 10 },
  rigaTitolo: { fontWeight: 600 },
  rigaNota: { fontSize: 8, color: GRIGIO },
  rigaImporto: { width: 78, textAlign: 'right' },
  totale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  totaleImporto: { fontSize: 13, fontWeight: 600 },
  nota: { fontSize: 8, color: GRIGIO, marginTop: 10 },
  condizioni: { fontSize: 8, color: GRIGIO, marginTop: 14 },
  piede: {
    position: 'absolute',
    bottom: 26,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: LINEA,
    paddingTop: 7,
    fontSize: 7.5,
    color: GRIGIO,
  },
})

export interface DocumentoPreventivoProps {
  readonly quote: Tables<'quotes'>
  readonly customerName: string | null
  readonly agency: Tables<'agencies'>
  readonly items: readonly QuoteItemRow[]
  readonly totals: readonly QuoteVariantTotals[]
}

/**
 * Costruisce il documento, e non è un componente React: `renderToBuffer` vuole
 * un elemento `<Document>`, e passare un componente che lo avvolge farebbe
 * fallire i tipi della libreria. Qui non servono stato né hook, quindi una
 * funzione che restituisce l'albero è la forma onesta.
 */
export function documentoPreventivo({
  quote,
  customerName,
  agency,
  items,
  totals,
}: DocumentoPreventivoProps): ReactElement<DocumentProps> {
  const varianti = ORDINE.filter((variante) =>
    items.some((riga) => riga.variant === variante),
  )

  const indirizzo = [
    agency.address_line,
    [agency.postal_code, agency.city, agency.province ? `(${agency.province})` : null]
      .filter(Boolean)
      .join(' '),
  ]
    .filter((parte) => parte && parte.trim() !== '')
    .join(' · ')

  const contatti = [agency.email, agency.phone, agency.website].filter(Boolean).join(' · ')

  const periodo = quote.departure_date
    ? quote.return_date
      ? `Dal ${formatDateShort(quote.departure_date)} al ${formatDateShort(quote.return_date)}`
      : `Partenza il ${formatDateLong(quote.departure_date)}`
    : null

  return (
    <Document
      title={`Preventivo ${quote.code} — ${quote.destination}`}
      author={agency.name}
      subject={quote.title}
      language="it"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.intestazione} fixed>
          <View>
            <Text style={styles.agenzia}>{agency.legal_name ?? agency.name}</Text>
            {indirizzo ? <Text style={styles.agenziaRiga}>{indirizzo}</Text> : null}
            {contatti ? <Text style={styles.agenziaRiga}>{contatti}</Text> : null}
            {agency.vat_number ? (
              <Text style={styles.agenziaRiga}>P. IVA {agency.vat_number}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.numero}>Preventivo</Text>
            <Text style={styles.numeroForte}>{quote.code}</Text>
            <Text style={styles.numero}>del {formatDateShort(quote.created_at)}</Text>
          </View>
        </View>

        <Text style={styles.titolo}>{quote.title}</Text>
        <Text style={styles.sottotitolo}>
          {[
            quote.destination,
            periodo,
            plurale(quote.pax_count, 'passeggero', 'passeggeri'),
            customerName ? `Per ${customerName}` : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>

        {quote.intro_text ? <Text style={styles.intro}>{quote.intro_text}</Text> : null}

        <Text style={styles.sezione}>
          {varianti.length === 1 ? 'La proposta' : 'Le proposte a confronto'}
        </Text>

        {varianti.map((variante) => (
          <Proposta
            key={variante}
            variante={variante}
            righe={items.filter((riga) => riga.variant === variante)}
            totale={totals.find((riga) => riga.variant === variante)?.revenue_cents ?? 0}
            pax={quote.pax_count}
            accettata={quote.accepted_variant === variante}
          />
        ))}

        {quote.valid_until ? (
          <Text style={styles.nota}>
            Proposta valida fino al {formatDateLong(quote.valid_until)}. I prezzi si intendono per
            l’intero gruppo di {plurale(quote.pax_count, 'passeggero', 'passeggeri')}, salvo diversa
            indicazione nelle singole voci.
          </Text>
        ) : null}

        {quote.terms_text ? (
          <View style={styles.condizioni}>
            <Text style={{ fontWeight: 600, marginBottom: 3 }}>Condizioni</Text>
            <Text>{quote.terms_text}</Text>
          </View>
        ) : null}

        <View style={styles.piede} fixed>
          <Text>
            {agency.name}
            {agency.vat_number ? ` · P. IVA ${agency.vat_number}` : ''}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

function Proposta({
  variante,
  righe,
  totale,
  pax,
  accettata,
}: {
  variante: Variante
  righe: readonly QuoteItemRow[]
  totale: number
  pax: number
  accettata: boolean
}) {
  return (
    <View style={styles.proposta} wrap={false}>
      <View style={styles.propostaTesta}>
        <View>
          <Text style={styles.propostaNome}>
            {QUOTE_VARIANT[variante].label}
            {accettata ? '  ·  Proposta scelta dal cliente' : ''}
          </Text>
          <Text style={styles.propostaNota}>{QUOTE_VARIANT[variante].note}</Text>
        </View>
        <Text style={styles.totaleImporto}>{formatEuro(totale)}</Text>
      </View>

      {righe.map((riga) => (
        <View key={riga.id} style={styles.riga}>
          <View style={styles.rigaDescrizione}>
            <Text style={styles.rigaTitolo}>
              {riga.description}
              {(riga.quantity ?? 1) > 1 ? ` × ${riga.quantity}` : ''}
            </Text>
            <Text style={styles.rigaNota}>
              {[
                riga.service_type ? SERVICE_TYPE[riga.service_type] : null,
                riga.date_from
                  ? riga.date_to && riga.date_to !== riga.date_from
                    ? `${formatDateShort(riga.date_from)} – ${formatDateShort(riga.date_to)}`
                    : formatDateShort(riga.date_from)
                  : null,
                riga.details,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          </View>
          <Text style={styles.rigaImporto}>{formatEuro(riga.total_price_cents ?? 0)}</Text>
        </View>
      ))}

      <View style={styles.totale}>
        <Text>
          Totale
          {pax > 1 ? `  ·  ${formatEuro(Math.round(totale / pax))} a persona` : ''}
        </Text>
        <Text style={styles.totaleImporto}>{formatEuro(totale)}</Text>
      </View>
    </View>
  )
}
