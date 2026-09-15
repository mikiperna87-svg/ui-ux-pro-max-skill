// GENERATO AUTOMATICAMENTE — non modificare a mano.
// Rigenerare con: npm run db:types (vedi scripts/gen-types.mjs)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Enums {
  activity_action: 'creazione' | 'modifica' | 'eliminazione' | 'cambio_stato' | 'incasso' | 'pagamento' | 'emissione_documento' | 'annullamento'
  booking_status: 'opzione' | 'confermata' | 'partita' | 'rientrata' | 'annullata'
  counter_kind: 'pratica' | 'preventivo' | 'fattura' | 'nota_credito'
  customer_kind: 'privato' | 'azienda'
  document_kind: 'voucher' | 'contratto' | 'documento_identita' | 'assicurazione' | 'fattura_fornitore' | 'preventivo' | 'fattura' | 'altro'
  id_document_type: 'carta_identita' | 'passaporto' | 'patente' | 'permesso_soggiorno'
  installment_kind: 'acconto' | 'saldo' | 'rata'
  invoice_kind: 'fattura' | 'nota_credito'
  invoice_status: 'bozza' | 'emessa' | 'inviata' | 'pagata' | 'annullata'
  passenger_role: 'titolare' | 'accompagnatore' | 'minore'
  payment_in_kind: 'acconto' | 'saldo' | 'extra' | 'rimborso'
  payment_method: 'contanti' | 'pos' | 'bonifico' | 'assegno' | 'link_pagamento' | 'compensazione'
  payment_state: 'non_pagata' | 'acconto_versato' | 'saldata' | 'in_ritardo'
  payout_status: 'da_pagare' | 'programmato' | 'pagato' | 'stornato'
  quote_status: 'bozza' | 'inviato' | 'accettato' | 'rifiutato' | 'scaduto' | 'convertito'
  quote_variant: 'base' | 'consigliata' | 'premium'
  sale_type: 'intermediazione' | 'organizzazione'
  service_type: 'volo' | 'hotel' | 'transfer' | 'assicurazione' | 'escursione' | 'biglietteria' | 'noleggio' | 'visto' | 'pacchetto' | 'altro'
  supplier_kind: 'tour_operator' | 'compagnia_aerea' | 'compagnia_ferroviaria' | 'compagnia_marittima' | 'hotel' | 'dmc' | 'assicurazione' | 'noleggio' | 'altro'
  task_kind: 'verifica_documenti' | 'scadenza_acconto' | 'scadenza_saldo' | 'pagamento_fornitore' | 'richiamo_cliente' | 'generico'
  task_priority: 'bassa' | 'media' | 'alta' | 'urgente'
  task_status: 'aperto' | 'in_corso' | 'completato' | 'annullato'
  user_role: 'titolare' | 'amministrativo' | 'operatore' | 'sola_lettura'
  vat_regime: 'ordinaria' | 'art_74_ter' | 'esente_art_10' | 'fuori_campo' | 'reverse_charge'
}

export interface Database {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string
          agency_id: string
          actor_id: string | null
          actor_label: string
          action: Enums['activity_action']
          entity_type: string
          entity_id: string | null
          entity_label: string | null
          summary: string
          before_data: Json | null
          after_data: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agency_id: string
          actor_id?: string | null
          actor_label?: string
          action: Enums['activity_action']
          entity_type: string
          entity_id?: string | null
          entity_label?: string | null
          summary: string
          before_data?: Json | null
          after_data?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agency_id?: string
          actor_id?: string | null
          actor_label?: string
          action?: Enums['activity_action']
          entity_type?: string
          entity_id?: string | null
          entity_label?: string | null
          summary?: string
          before_data?: Json | null
          after_data?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          id: string
          agency_id: string | null
          name: string
          legal_name: string | null
          vat_number: string | null
          tax_code: string | null
          rea_number: string | null
          address_line: string | null
          postal_code: string | null
          city: string | null
          province: string | null
          country: string
          email: string | null
          pec: string | null
          phone: string | null
          website: string | null
          iban: string | null
          logo_path: string | null
          fiscal_regime: string
          license_number: string | null
          insurance_policy: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          name: string
          legal_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          rea_number?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          email?: string | null
          pec?: string | null
          phone?: string | null
          website?: string | null
          iban?: string | null
          logo_path?: string | null
          fiscal_regime?: string
          license_number?: string | null
          insurance_policy?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          legal_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          rea_number?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          email?: string | null
          pec?: string | null
          phone?: string | null
          website?: string | null
          iban?: string | null
          logo_path?: string | null
          fiscal_regime?: string
          license_number?: string | null
          insurance_policy?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      agency_settings: {
        Row: {
          id: string
          agency_id: string
          deposit_due_days: number
          balance_due_days_before_departure: number
          deposit_percent_bps: number
          supplier_alert_days: number[]
          passenger_document_alert_days: number
          default_vat_bps: number
          default_sale_type: Enums['sale_type']
          booking_number_prefix: string
          quote_number_prefix: string
          invoice_number_prefix: string
          credit_note_number_prefix: string
          quote_validity_days: number
          hide_margins_from_operators: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          deposit_due_days?: number
          balance_due_days_before_departure?: number
          deposit_percent_bps?: number
          supplier_alert_days?: number[]
          passenger_document_alert_days?: number
          default_vat_bps?: number
          default_sale_type?: Enums['sale_type']
          booking_number_prefix?: string
          quote_number_prefix?: string
          invoice_number_prefix?: string
          credit_note_number_prefix?: string
          quote_validity_days?: number
          hide_margins_from_operators?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          deposit_due_days?: number
          balance_due_days_before_departure?: number
          deposit_percent_bps?: number
          supplier_alert_days?: number[]
          passenger_document_alert_days?: number
          default_vat_bps?: number
          default_sale_type?: Enums['sale_type']
          booking_number_prefix?: string
          quote_number_prefix?: string
          invoice_number_prefix?: string
          credit_note_number_prefix?: string
          quote_validity_days?: number
          hide_margins_from_operators?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      booking_passengers: {
        Row: {
          id: string
          agency_id: string
          booking_id: string
          passenger_id: string
          role: Enums['passenger_role']
          room_label: string | null
          seat_label: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id: string
          passenger_id: string
          role?: Enums['passenger_role']
          room_label?: string | null
          seat_label?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string
          passenger_id?: string
          role?: Enums['passenger_role']
          room_label?: string | null
          seat_label?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      booking_services: {
        Row: {
          id: string
          agency_id: string
          booking_id: string
          service_type: Enums['service_type']
          supplier_id: string | null
          description: string
          details: string | null
          confirmation_code: string | null
          date_from: string | null
          date_to: string | null
          quantity: number
          unit_cost_cents: number
          unit_price_cents: number
          commission_bps: number
          commission_override_cents: number | null
          vat_bps: number
          vat_regime: Enums['vat_regime']
          supplier_due_date: string | null
          sort_order: number
          total_cost_cents: number | null
          total_price_cents: number | null
          commission_cents: number | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id: string
          service_type?: Enums['service_type']
          supplier_id?: string | null
          description: string
          details?: string | null
          confirmation_code?: string | null
          date_from?: string | null
          date_to?: string | null
          quantity?: number
          unit_cost_cents?: number
          unit_price_cents?: number
          commission_bps?: number
          commission_override_cents?: number | null
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          supplier_due_date?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string
          service_type?: Enums['service_type']
          supplier_id?: string | null
          description?: string
          details?: string | null
          confirmation_code?: string | null
          date_from?: string | null
          date_to?: string | null
          quantity?: number
          unit_cost_cents?: number
          unit_price_cents?: number
          commission_bps?: number
          commission_override_cents?: number | null
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          supplier_due_date?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          agency_id: string
          year: number
          number: number
          code: string
          customer_id: string
          owner_id: string | null
          quote_id: string | null
          title: string
          destination: string
          country: string | null
          departure_date: string | null
          return_date: string | null
          pax_count: number
          status: Enums['booking_status']
          sale_type: Enums['sale_type']
          notes: string | null
          internal_notes: string | null
          confirmed_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          cancellation_penalty_cents: number
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          year: number
          number: number
          code: string
          customer_id: string
          owner_id?: string | null
          quote_id?: string | null
          title: string
          destination: string
          country?: string | null
          departure_date?: string | null
          return_date?: string | null
          pax_count?: number
          status?: Enums['booking_status']
          sale_type?: Enums['sale_type']
          notes?: string | null
          internal_notes?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancellation_penalty_cents?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          year?: number
          number?: number
          code?: string
          customer_id?: string
          owner_id?: string | null
          quote_id?: string | null
          title?: string
          destination?: string
          country?: string | null
          departure_date?: string | null
          return_date?: string | null
          pax_count?: number
          status?: Enums['booking_status']
          sale_type?: Enums['sale_type']
          notes?: string | null
          internal_notes?: string | null
          confirmed_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          cancellation_penalty_cents?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          agency_id: string
          kind: Enums['customer_kind']
          first_name: string | null
          last_name: string | null
          company_name: string | null
          display_name: string | null
          vat_number: string | null
          tax_code: string | null
          sdi_code: string | null
          pec: string | null
          email: string | null
          phone: string | null
          mobile: string | null
          address_line: string | null
          postal_code: string | null
          city: string | null
          province: string | null
          country: string
          birth_date: string | null
          birth_place: string | null
          notes: string | null
          tags: string[]
          preferred_contact: string | null
          privacy_consent_at: string | null
          marketing_consent: boolean
          marketing_consent_at: string | null
          profiling_consent: boolean
          anonymized_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
          search_text: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          kind?: Enums['customer_kind']
          first_name?: string | null
          last_name?: string | null
          company_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          sdi_code?: string | null
          pec?: string | null
          email?: string | null
          phone?: string | null
          mobile?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          birth_date?: string | null
          birth_place?: string | null
          notes?: string | null
          tags?: string[]
          preferred_contact?: string | null
          privacy_consent_at?: string | null
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          profiling_consent?: boolean
          anonymized_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          kind?: Enums['customer_kind']
          first_name?: string | null
          last_name?: string | null
          company_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          sdi_code?: string | null
          pec?: string | null
          email?: string | null
          phone?: string | null
          mobile?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          birth_date?: string | null
          birth_place?: string | null
          notes?: string | null
          tags?: string[]
          preferred_contact?: string | null
          privacy_consent_at?: string | null
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          profiling_consent?: boolean
          anonymized_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      document_counters: {
        Row: {
          agency_id: string
          kind: Enums['counter_kind']
          year: number
          last_number: number
          updated_at: string
        }
        Insert: {
          agency_id: string
          kind: Enums['counter_kind']
          year: number
          last_number?: number
          updated_at?: string
        }
        Update: {
          agency_id?: string
          kind?: Enums['counter_kind']
          year?: number
          last_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          agency_id: string
          booking_id: string | null
          passenger_id: string | null
          customer_id: string | null
          quote_id: string | null
          invoice_id: string | null
          kind: Enums['document_kind']
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id?: string | null
          passenger_id?: string | null
          customer_id?: string | null
          quote_id?: string | null
          invoice_id?: string | null
          kind?: Enums['document_kind']
          file_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string | null
          passenger_id?: string | null
          customer_id?: string | null
          quote_id?: string | null
          invoice_id?: string | null
          kind?: Enums['document_kind']
          file_path?: string
          file_name?: string
          mime_type?: string
          size_bytes?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          id: string
          agency_id: string
          booking_id: string
          source: string
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id: string
          source?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string
          source?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      installments: {
        Row: {
          id: string
          agency_id: string
          plan_id: string
          booking_id: string
          kind: Enums['installment_kind']
          due_date: string
          amount_cents: number
          sort_order: number
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          plan_id: string
          booking_id: string
          kind?: Enums['installment_kind']
          due_date: string
          amount_cents: number
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          plan_id?: string
          booking_id?: string
          kind?: Enums['installment_kind']
          due_date?: string
          amount_cents?: number
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          agency_id: string
          invoice_id: string
          description: string
          quantity: number
          unit_price_cents: number
          cost_cents: number
          vat_bps: number
          vat_regime: Enums['vat_regime']
          sort_order: number
          gross_cents: number | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          invoice_id: string
          description: string
          quantity?: number
          unit_price_cents?: number
          cost_cents?: number
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          invoice_id?: string
          description?: string
          quantity?: number
          unit_price_cents?: number
          cost_cents?: number
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          agency_id: string
          kind: Enums['invoice_kind']
          year: number
          number: number
          code: string
          customer_id: string
          booking_id: string | null
          credit_note_of: string | null
          issue_date: string
          due_date: string | null
          status: Enums['invoice_status']
          vat_regime: Enums['vat_regime']
          taxable_cents: number
          vat_cents: number
          total_cents: number
          payment_terms: string | null
          notes: string | null
          legal_notes: string | null
          pdf_path: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          kind?: Enums['invoice_kind']
          year: number
          number: number
          code: string
          customer_id: string
          booking_id?: string | null
          credit_note_of?: string | null
          issue_date?: string
          due_date?: string | null
          status?: Enums['invoice_status']
          vat_regime?: Enums['vat_regime']
          taxable_cents?: number
          vat_cents?: number
          total_cents?: number
          payment_terms?: string | null
          notes?: string | null
          legal_notes?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          kind?: Enums['invoice_kind']
          year?: number
          number?: number
          code?: string
          customer_id?: string
          booking_id?: string | null
          credit_note_of?: string | null
          issue_date?: string
          due_date?: string | null
          status?: Enums['invoice_status']
          vat_regime?: Enums['vat_regime']
          taxable_cents?: number
          vat_cents?: number
          total_cents?: number
          payment_terms?: string | null
          notes?: string | null
          legal_notes?: string | null
          pdf_path?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          id: string
          agency_id: string
          user_id: string
          role: Enums['user_role']
          full_name: string
          email: string
          phone: string | null
          job_title: string | null
          avatar_path: string | null
          is_active: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          user_id: string
          role?: Enums['user_role']
          full_name: string
          email: string
          phone?: string | null
          job_title?: string | null
          avatar_path?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          user_id?: string
          role?: Enums['user_role']
          full_name?: string
          email?: string
          phone?: string | null
          job_title?: string | null
          avatar_path?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      passengers: {
        Row: {
          id: string
          agency_id: string
          customer_id: string | null
          first_name: string
          last_name: string
          full_name: string | null
          birth_date: string | null
          birth_place: string | null
          gender: string | null
          nationality: string
          tax_code: string | null
          email: string | null
          phone: string | null
          document_type: Enums['id_document_type'] | null
          document_number: string | null
          document_issued_at: string | null
          document_expires_at: string | null
          document_issuer: string | null
          dietary_needs: string | null
          special_needs: string | null
          frequent_flyer: string | null
          notes: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
          search_text: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          customer_id?: string | null
          first_name: string
          last_name: string
          birth_date?: string | null
          birth_place?: string | null
          gender?: string | null
          nationality?: string
          tax_code?: string | null
          email?: string | null
          phone?: string | null
          document_type?: Enums['id_document_type'] | null
          document_number?: string | null
          document_issued_at?: string | null
          document_expires_at?: string | null
          document_issuer?: string | null
          dietary_needs?: string | null
          special_needs?: string | null
          frequent_flyer?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          customer_id?: string | null
          first_name?: string
          last_name?: string
          birth_date?: string | null
          birth_place?: string | null
          gender?: string | null
          nationality?: string
          tax_code?: string | null
          email?: string | null
          phone?: string | null
          document_type?: Enums['id_document_type'] | null
          document_number?: string | null
          document_issued_at?: string | null
          document_expires_at?: string | null
          document_issuer?: string | null
          dietary_needs?: string | null
          special_needs?: string | null
          frequent_flyer?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      payments_in: {
        Row: {
          id: string
          agency_id: string
          booking_id: string | null
          invoice_id: string | null
          installment_id: string | null
          customer_id: string | null
          kind: Enums['payment_in_kind']
          method: Enums['payment_method']
          amount_cents: number
          paid_at: string
          reference: string | null
          notes: string | null
          idempotency_key: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id?: string | null
          invoice_id?: string | null
          installment_id?: string | null
          customer_id?: string | null
          kind?: Enums['payment_in_kind']
          method?: Enums['payment_method']
          amount_cents: number
          paid_at?: string
          reference?: string | null
          notes?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string | null
          invoice_id?: string | null
          installment_id?: string | null
          customer_id?: string | null
          kind?: Enums['payment_in_kind']
          method?: Enums['payment_method']
          amount_cents?: number
          paid_at?: string
          reference?: string | null
          notes?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      payments_out: {
        Row: {
          id: string
          agency_id: string
          booking_id: string | null
          booking_service_id: string | null
          supplier_id: string
          amount_cents: number
          due_date: string
          paid_at: string | null
          status: Enums['payout_status']
          method: Enums['payment_method']
          reference: string | null
          supplier_invoice_number: string | null
          notes: string | null
          idempotency_key: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          booking_id?: string | null
          booking_service_id?: string | null
          supplier_id: string
          amount_cents: number
          due_date: string
          paid_at?: string | null
          status?: Enums['payout_status']
          method?: Enums['payment_method']
          reference?: string | null
          supplier_invoice_number?: string | null
          notes?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          booking_id?: string | null
          booking_service_id?: string | null
          supplier_id?: string
          amount_cents?: number
          due_date?: string
          paid_at?: string | null
          status?: Enums['payout_status']
          method?: Enums['payment_method']
          reference?: string | null
          supplier_invoice_number?: string | null
          notes?: string | null
          idempotency_key?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          id: string
          agency_id: string
          quote_id: string
          variant: Enums['quote_variant']
          service_type: Enums['service_type']
          supplier_id: string | null
          description: string
          details: string | null
          date_from: string | null
          date_to: string | null
          quantity: number
          unit_cost_cents: number
          unit_price_cents: number
          commission_bps: number
          commission_override_cents: number | null
          vat_bps: number
          vat_regime: Enums['vat_regime']
          sort_order: number
          total_cost_cents: number | null
          total_price_cents: number | null
          commission_cents: number | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          quote_id: string
          variant?: Enums['quote_variant']
          service_type?: Enums['service_type']
          supplier_id?: string | null
          description: string
          details?: string | null
          date_from?: string | null
          date_to?: string | null
          quantity?: number
          unit_cost_cents?: number
          unit_price_cents?: number
          commission_bps?: number
          commission_override_cents?: number | null
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          quote_id?: string
          variant?: Enums['quote_variant']
          service_type?: Enums['service_type']
          supplier_id?: string | null
          description?: string
          details?: string | null
          date_from?: string | null
          date_to?: string | null
          quantity?: number
          unit_cost_cents?: number
          unit_price_cents?: number
          commission_bps?: number
          commission_override_cents?: number | null
          vat_bps?: number
          vat_regime?: Enums['vat_regime']
          sort_order?: number
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          id: string
          agency_id: string
          year: number
          number: number
          code: string
          customer_id: string | null
          owner_id: string | null
          title: string
          destination: string
          departure_date: string | null
          return_date: string | null
          pax_count: number
          status: Enums['quote_status']
          sale_type: Enums['sale_type']
          valid_until: string | null
          intro_text: string | null
          terms_text: string | null
          notes: string | null
          public_token: string
          sent_at: string | null
          accepted_variant: Enums['quote_variant'] | null
          accepted_at: string | null
          accepted_by_name: string | null
          accepted_ip: string | null
          rejected_at: string | null
          rejection_reason: string | null
          converted_booking_id: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          year: number
          number: number
          code: string
          customer_id?: string | null
          owner_id?: string | null
          title: string
          destination: string
          departure_date?: string | null
          return_date?: string | null
          pax_count?: number
          status?: Enums['quote_status']
          sale_type?: Enums['sale_type']
          valid_until?: string | null
          intro_text?: string | null
          terms_text?: string | null
          notes?: string | null
          public_token?: string
          sent_at?: string | null
          accepted_variant?: Enums['quote_variant'] | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          converted_booking_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          year?: number
          number?: number
          code?: string
          customer_id?: string | null
          owner_id?: string | null
          title?: string
          destination?: string
          departure_date?: string | null
          return_date?: string | null
          pax_count?: number
          status?: Enums['quote_status']
          sale_type?: Enums['sale_type']
          valid_until?: string | null
          intro_text?: string | null
          terms_text?: string | null
          notes?: string | null
          public_token?: string
          sent_at?: string | null
          accepted_variant?: Enums['quote_variant'] | null
          accepted_at?: string | null
          accepted_by_name?: string | null
          accepted_ip?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          converted_booking_id?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          window_start: string
          hits: number
          updated_at: string
        }
        Insert: {
          bucket: string
          window_start?: string
          hits?: number
          updated_at?: string
        }
        Update: {
          bucket?: string
          window_start?: string
          hits?: number
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string
          agency_id: string
          kind: Enums['supplier_kind']
          name: string
          legal_name: string | null
          vat_number: string | null
          tax_code: string | null
          email: string | null
          pec: string | null
          phone: string | null
          contact_name: string | null
          address_line: string | null
          postal_code: string | null
          city: string | null
          province: string | null
          country: string
          iban: string | null
          payment_terms_days: number
          default_commission_bps: number
          default_vat_regime: Enums['vat_regime']
          booking_portal_url: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
          search_text: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          kind?: Enums['supplier_kind']
          name: string
          legal_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          email?: string | null
          pec?: string | null
          phone?: string | null
          contact_name?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          iban?: string | null
          payment_terms_days?: number
          default_commission_bps?: number
          default_vat_regime?: Enums['vat_regime']
          booking_portal_url?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          kind?: Enums['supplier_kind']
          name?: string
          legal_name?: string | null
          vat_number?: string | null
          tax_code?: string | null
          email?: string | null
          pec?: string | null
          phone?: string | null
          contact_name?: string | null
          address_line?: string | null
          postal_code?: string | null
          city?: string | null
          province?: string | null
          country?: string
          iban?: string | null
          payment_terms_days?: number
          default_commission_bps?: number
          default_vat_regime?: Enums['vat_regime']
          booking_portal_url?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          agency_id: string
          title: string
          description: string | null
          kind: Enums['task_kind']
          status: Enums['task_status']
          priority: Enums['task_priority']
          due_at: string | null
          assignee_id: string | null
          booking_id: string | null
          customer_id: string | null
          quote_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          updated_at: string
          created_by: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          agency_id: string
          title: string
          description?: string | null
          kind?: Enums['task_kind']
          status?: Enums['task_status']
          priority?: Enums['task_priority']
          due_at?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          customer_id?: string | null
          quote_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          agency_id?: string
          title?: string
          description?: string | null
          kind?: Enums['task_kind']
          status?: Enums['task_status']
          priority?: Enums['task_priority']
          due_at?: string | null
          assignee_id?: string | null
          booking_id?: string | null
          customer_id?: string | null
          quote_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          updated_at?: string
          created_by?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      booking_financials: {
        Row: {
          booking_id: string | null
          agency_id: string | null
          revenue_cents: number | null
          cost_cents: number | null
          commission_cents: number | null
          vat_cents: number | null
          margin_cents: number | null
          margin_bps: number | null
          paid_cents: number | null
          balance_cents: number | null
          supplier_due_cents: number | null
          next_due_date: string | null
          due_so_far_cents: number | null
          payment_state: Enums['payment_state'] | null
        }
        Relationships: []
      }
      booking_service_amounts: {
        Row: {
          id: string | null
          agency_id: string | null
          booking_id: string | null
          total_price_cents: number | null
          total_cost_cents: number | null
          commission_cents: number | null
          margin_cents: number | null
          taxable_cents: number | null
          vat_cents: number | null
        }
        Relationships: []
      }
      customer_list: {
        Row: {
          id: string | null
          agency_id: string | null
          kind: Enums['customer_kind'] | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          company_name: string | null
          email: string | null
          phone: string | null
          mobile: string | null
          city: string | null
          province: string | null
          vat_number: string | null
          tax_code: string | null
          tags: string[] | null
          marketing_consent: boolean | null
          privacy_consent_at: string | null
          anonymized_at: string | null
          created_at: string | null
          created_by: string | null
          search_text: string | null
          bookings_count: number | null
          active_count: number | null
          lifetime_value_cents: number | null
          lifetime_margin_cents: number | null
          open_balance_cents: number | null
          last_departure: string | null
          next_departure: string | null
          passengers_count: number | null
        }
        Relationships: []
      }
      customer_stats: {
        Row: {
          customer_id: string | null
          agency_id: string | null
          bookings_count: number | null
          active_count: number | null
          cancelled_count: number | null
          lifetime_value_cents: number | null
          lifetime_margin_cents: number | null
          open_balance_cents: number | null
          first_departure: string | null
          last_departure: string | null
          next_departure: string | null
          passengers_count: number | null
        }
        Relationships: []
      }
      passenger_documents: {
        Row: {
          passenger_id: string | null
          agency_id: string | null
          document_expires_at: string | null
          next_return_date: string | null
          days_to_expiry: number | null
          document_state: string | null
        }
        Relationships: []
      }
      passenger_list: {
        Row: {
          id: string | null
          agency_id: string | null
          customer_id: string | null
          customer_name: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          birth_date: string | null
          nationality: string | null
          email: string | null
          phone: string | null
          document_type: Enums['id_document_type'] | null
          document_number: string | null
          document_expires_at: string | null
          dietary_needs: string | null
          special_needs: string | null
          created_at: string | null
          search_text: string | null
          document_state: string | null
          days_to_expiry: number | null
          next_return_date: string | null
          bookings_count: number | null
        }
        Relationships: []
      }
      supplier_list: {
        Row: {
          id: string | null
          agency_id: string | null
          kind: Enums['supplier_kind'] | null
          name: string | null
          legal_name: string | null
          email: string | null
          phone: string | null
          contact_name: string | null
          city: string | null
          province: string | null
          vat_number: string | null
          iban: string | null
          payment_terms_days: number | null
          default_commission_bps: number | null
          default_vat_regime: Enums['vat_regime'] | null
          is_active: boolean | null
          created_at: string | null
          search_text: string | null
          services_count: number | null
          bookings_count: number | null
          cost_cents: number | null
          revenue_cents: number | null
          margin_cents: number | null
          margin_bps: number | null
          open_payable_cents: number | null
          overdue_payable_cents: number | null
          next_due_date: string | null
          last_service_date: string | null
        }
        Relationships: []
      }
      supplier_stats: {
        Row: {
          supplier_id: string | null
          agency_id: string | null
          services_count: number | null
          bookings_count: number | null
          cost_cents: number | null
          revenue_cents: number | null
          margin_cents: number | null
          margin_bps: number | null
          open_payable_cents: number | null
          overdue_payable_cents: number | null
          next_due_date: string | null
          last_service_date: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymize_customer: {
        Args: { p_customer_id: string | null }
        Returns: undefined
      }
      check_rate_limit: {
        Args: { p_bucket: string | null; p_limit?: number | null; p_window_seconds?: number | null }
        Returns: boolean
      }
      create_agency_with_owner: {
        Args: { p_agency_name: string | null; p_full_name: string | null; p_vat_number?: string | null; p_email?: string | null }
        Returns: string
      }
      dashboard_kpis: {
        Args: { p_from: string | null; p_to: string | null; p_owner_id?: string | null }
        Returns: { bookings_count: number | null; confirmed_count: number | null; revenue_cents: number | null; cost_cents: number | null; margin_cents: number | null; margin_bps: number | null; average_ticket_cents: number | null; collected_cents: number | null; receivable_cents: number | null; overdue_cents: number | null; supplier_due_cents: number | null }[]
      }
      export_customer_data: {
        Args: { p_customer_id: string | null }
        Returns: Json
      }
      log_activity: {
        Args: { p_agency_id: string | null; p_action: Enums['activity_action'] | null; p_entity_type: string | null; p_entity_id: string | null; p_entity_label: string | null; p_summary: string | null; p_before?: Json | null; p_after?: Json | null }
        Returns: string
      }
      monthly_trend: {
        Args: { p_months?: number | null; p_owner_id?: string | null }
        Returns: { month_start: string | null; revenue_cents: number | null; margin_cents: number | null; bookings_count: number | null }[]
      }
      purge_rate_limits: {
        Args: { p_older_than_hours?: number | null }
        Returns: number
      }
      upcoming_departures: {
        Args: { p_days?: number | null; p_limit?: number | null; p_owner_id?: string | null }
        Returns: { booking_id: string | null; code: string | null; title: string | null; destination: string | null; departure_date: string | null; return_date: string | null; pax_count: number | null; status: Enums['booking_status'] | null; customer_name: string | null; owner_name: string | null; revenue_cents: number | null; balance_cents: number | null; payment_state: Enums['payment_state'] | null }[]
      }
      upcoming_supplier_payments: {
        Args: { p_days?: number | null; p_limit?: number | null }
        Returns: { payment_id: string | null; supplier_name: string | null; booking_code: string | null; amount_cents: number | null; due_date: string | null; status: Enums['payout_status'] | null; days_left: number | null }[]
      }
    }
    Enums: Enums
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
