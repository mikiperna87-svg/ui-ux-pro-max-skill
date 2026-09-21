import { Document, type DocumentProps, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { formatDateShort } from '@/lib/date'
import type { Tables } from '@/lib/database.types'
import { INVOICE_KIND, VAT_REGIME } from '@/lib/labels'
import { formatEuro, formatPercent } from '@/lib/money'
import { FAMIGLIA_PDF } from '@/server/pdf/caratteri'
import type { InvoiceItemRow } from '@/server/queries/fatture'

/**
 * Il PDF della fattura.
 *
 * Colori scritti in chiaro e non token: il PDF non ha temi né foglio di stile
 * condiviso, e questi pochi valori sono scelti per reggere anche la stampa in
 * bianco e nero.
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
    fontSize: 9,
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
    marginBottom: 16,
  },
  agenzia: { fontSize: 13, fontWeight: 600 },
  minuto: { fontSize: 8, color: GRIGIO },
  documento: { fontSize: 8, color: GRIGIO, textAlign: 'right' },
  numero: { fontSize: 14, fontWeight: 600, textAlign: 'right' },
  parti: { flexDirection: 'row', justifyContent: 'space-between', gap: 24, marginBottom: 16 },
  parte: { flex: 1 },
  etichetta: {
    fontSize: 7.5,
    color: GRIGIO,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  forte: { fontWeight: 600 },
  tabellaTesta: {
    flexDirection: 'row',
    backgroundColor: SFONDO,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINEA,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 7.5,
    color: GRIGIO,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  riga: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: LINEA,
  },
  colDescrizione: { flex: 1, paddingRight: 8 },
  colNumero: { width: 34, textAlign: 'right' },
  colImporto: { width: 62, textAlign: 'right' },
  colIva: { width: 44, textAlign: 'right' },
  riepilogo: { marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' },
  riepilogoRiga: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 230,
    paddingVertical: 2,
  },
  totale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 230,
    borderTopWidth: 1,
    borderTopColor: LINEA,
    marginTop: 4,
    paddingTop: 5,
  },
  totaleImporto: { fontSize: 13, fontWeight: 600 },
  blocco: { marginTop: 16 },
  nota: { fontSize: 8, color: GRIGIO },
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

export interface DocumentoFatturaProps {
  readonly invoice: Tables<'invoices'>
  readonly customer: Tables<'customers'>
  readonly agency: Tables<'agencies'>
  readonly items: readonly InvoiceItemRow[]
  readonly bookingCode: string | null
  readonly creditNoteOfCode: string | null
}

/**
 * Costruisce il documento, e non è un componente React: `renderToBuffer` vuole
 * un elemento `<Document>`, e passare un componente che lo avvolge farebbe
 * fallire i tipi della libreria.
 */
export function documentoFattura({
  invoice,
  customer,
  agency,
  items,
  bookingCode,
  creditNoteOfCode,
}: DocumentoFatturaProps): ReactElement<DocumentProps> {
  const indirizzoAgenzia = [
    agency.address_line,
    [agency.postal_code, agency.city, agency.province ? `(${agency.province})` : null]
      .filter(Boolean)
      .join(' '),
  ]
    .filter((parte) => parte && parte.trim() !== '')
    .join(' · ')

  const indirizzoCliente = [
    customer.address_line,
    [customer.postal_code, customer.city, customer.province ? `(${customer.province})` : null]
      .filter(Boolean)
      .join(' '),
  ]
    .filter((parte) => parte && parte.trim() !== '')
    .join(' · ')

  // Un totale per aliquota e regime: è il riepilogo che rende leggibile una
  // fattura con righe in regimi diversi, e nel 74-ter mostra il margine da cui
  // l'imposta è stata scorporata.
  const riepilogo = new Map<
    string,
    { regime: string; aliquota: number; imponibile: number; iva: number; margine: number }
  >()

  for (const riga of items) {
    const chiave = `${riga.vat_regime}-${riga.vat_bps}`
    const corrente = riepilogo.get(chiave) ?? {
      regime: riga.vat_regime ? VAT_REGIME[riga.vat_regime].label : '',
      aliquota: riga.vat_bps ?? 0,
      imponibile: 0,
      iva: 0,
      margine: 0,
    }
    corrente.imponibile += riga.taxable_cents ?? 0
    corrente.iva += riga.vat_cents ?? 0
    corrente.margine += riga.margin_cents ?? 0
    riepilogo.set(chiave, corrente)
  }

  const conMargine = items.some((riga) => riga.vat_regime === 'art_74_ter')
  const etichetta = INVOICE_KIND[invoice.kind]

  return (
    <Document
      title={`${etichetta} ${invoice.code ?? ''}`.trim()}
      author={agency.name}
      subject={`${etichetta} per ${customer.display_name}`}
      language="it"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.intestazione} fixed>
          <View>
            <Text style={styles.agenzia}>{agency.legal_name ?? agency.name}</Text>
            {indirizzoAgenzia ? <Text style={styles.minuto}>{indirizzoAgenzia}</Text> : null}
            <Text style={styles.minuto}>
              {[agency.email, agency.phone].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.minuto}>
              {[
                agency.vat_number ? `P. IVA ${agency.vat_number}` : null,
                agency.tax_code ? `C.F. ${agency.tax_code}` : null,
                agency.rea_number ? `REA ${agency.rea_number}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <View>
            <Text style={styles.documento}>{etichetta}</Text>
            <Text style={styles.numero}>{invoice.code ?? '—'}</Text>
            <Text style={styles.documento}>del {formatDateShort(invoice.issue_date)}</Text>
            {creditNoteOfCode ? (
              <Text style={styles.documento}>a storno della fattura {creditNoteOfCode}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.parti}>
          <View style={styles.parte}>
            <Text style={styles.etichetta}>Intestatario</Text>
            <Text style={styles.forte}>{customer.display_name}</Text>
            {indirizzoCliente ? <Text style={styles.minuto}>{indirizzoCliente}</Text> : null}
            <Text style={styles.minuto}>
              {[
                customer.vat_number ? `P. IVA ${customer.vat_number}` : null,
                customer.tax_code ? `C.F. ${customer.tax_code}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {customer.sdi_code || customer.pec ? (
              <Text style={styles.minuto}>
                {[
                  customer.sdi_code ? `Codice SDI ${customer.sdi_code}` : null,
                  customer.pec ? `PEC ${customer.pec}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={styles.parte}>
            <Text style={styles.etichetta}>Riferimenti</Text>
            {bookingCode ? <Text>Pratica {bookingCode}</Text> : null}
            <Text style={styles.minuto}>
              Scadenza del pagamento: {formatDateShort(invoice.due_date) || '—'}
            </Text>
            {invoice.payment_terms ? (
              <Text style={styles.minuto}>{invoice.payment_terms}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.tabellaTesta} fixed>
          <Text style={styles.colDescrizione}>Descrizione</Text>
          <Text style={styles.colNumero}>Q.tà</Text>
          {conMargine ? <Text style={styles.colImporto}>Corrispettivo</Text> : null}
          <Text style={styles.colImporto}>Imponibile</Text>
          <Text style={styles.colIva}>IVA</Text>
          <Text style={styles.colImporto}>Importo</Text>
        </View>

        {items.map((riga) => (
          <View key={riga.id} style={styles.riga} wrap={false}>
            <View style={styles.colDescrizione}>
              <Text>{riga.description}</Text>
              <Text style={styles.nota}>
                {riga.vat_regime ? VAT_REGIME[riga.vat_regime].label : ''}
                {riga.vat_bps ? ` · ${formatPercent(riga.vat_bps)}` : ''}
              </Text>
            </View>
            <Text style={styles.colNumero}>{riga.quantity}</Text>
            {conMargine ? (
              <Text style={styles.colImporto}>{formatEuro(riga.gross_cents ?? 0)}</Text>
            ) : null}
            <Text style={styles.colImporto}>{formatEuro(riga.taxable_cents ?? 0)}</Text>
            <Text style={styles.colIva}>{formatEuro(riga.vat_cents ?? 0)}</Text>
            <Text style={styles.colImporto}>{formatEuro(riga.gross_cents ?? 0)}</Text>
          </View>
        ))}

        <View style={styles.riepilogo}>
          <View>
            {[...riepilogo.values()].map((voce) => (
              <View key={`${voce.regime}-${voce.aliquota}`} style={styles.riepilogoRiga}>
                <Text style={styles.nota}>
                  {voce.regime} {formatPercent(voce.aliquota)}
                  {voce.regime === VAT_REGIME.art_74_ter.label
                    ? ` · margine ${formatEuro(voce.margine)}`
                    : ''}
                </Text>
                <Text style={styles.nota}>
                  {formatEuro(voce.imponibile)} + {formatEuro(voce.iva)}
                </Text>
              </View>
            ))}

            <View style={styles.riepilogoRiga}>
              <Text>Imponibile</Text>
              <Text>{formatEuro(invoice.taxable_cents)}</Text>
            </View>
            <View style={styles.riepilogoRiga}>
              <Text>IVA</Text>
              <Text>{formatEuro(invoice.vat_cents)}</Text>
            </View>
            <View style={styles.totale}>
              <Text style={styles.forte}>
                {invoice.kind === 'nota_credito' ? 'Totale a credito' : 'Totale documento'}
              </Text>
              <Text style={styles.totaleImporto}>{formatEuro(invoice.total_cents)}</Text>
            </View>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.blocco}>
            <Text style={styles.etichetta}>Note</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        {invoice.legal_notes ? (
          <View style={styles.blocco}>
            <Text style={styles.nota}>{invoice.legal_notes}</Text>
          </View>
        ) : null}

        {agency.iban ? (
          <View style={styles.blocco}>
            <Text style={styles.etichetta}>Pagamento</Text>
            <Text style={styles.nota}>IBAN {agency.iban}</Text>
          </View>
        ) : null}

        <View style={styles.piede} fixed>
          <Text>
            {agency.name}
            {agency.vat_number ? ` · P. IVA ${agency.vat_number}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
