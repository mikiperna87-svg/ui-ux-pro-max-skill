-- =============================================================================
-- Seed dimostrativo: un'agenzia completa e navigabile dal primo avvio.
--   1 agenzia · 3 utenti (titolare, amministrativo, operatore)
--   14 fornitori · 40 clienti · 70 passeggeri
--   60 pratiche in stati diversi, con servizi, incassi, scadenze e pagamenti
--   fatture e note di credito · task · registro attivita'
--
-- Rieseguibile: cancella i dati dell'agenzia dimostrativa e li ricrea.
-- Credenziali: titolare@orizzontiviaggi.it / Gestionale2026!
--              (stessa password per amministrativo@ e operatore@)
-- =============================================================================

do $$
declare
  v_agency_id   uuid := '11111111-1111-4111-8111-111111111111';
  v_owner_id    uuid := '22222222-2222-4222-8222-222222222221';
  v_admin_id    uuid := '22222222-2222-4222-8222-222222222222';
  v_operator_id uuid := '22222222-2222-4222-8222-222222222223';
  v_m_owner     uuid;
  v_m_admin     uuid;
  v_m_operator  uuid;
  v_password    text;
begin
  -- Pulizia: l'agenzia e' la radice, il cascade fa il resto.
  delete from public.agencies where id = v_agency_id;
  delete from auth.users where id in (v_owner_id, v_admin_id, v_operator_id);

  v_password := crypt('Gestionale2026!', gen_salt('bf'));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    ('00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
     'titolare@orizzontiviaggi.it', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Giulia Marchetti"}'::jsonb, now() - interval '400 days', now()),
    ('00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
     'amministrativo@orizzontiviaggi.it', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Paolo Ferrero"}'::jsonb, now() - interval '380 days', now()),
    ('00000000-0000-0000-0000-000000000000', v_operator_id, 'authenticated', 'authenticated',
     'operatore@orizzontiviaggi.it', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Sara Bonomi"}'::jsonb, now() - interval '300 days', now())
  on conflict (id) do nothing;

  -- --- Agenzia ---------------------------------------------------------------
  insert into public.agencies (
    id, name, legal_name, vat_number, tax_code, rea_number, address_line, postal_code,
    city, province, country, email, pec, phone, website, iban, fiscal_regime,
    license_number, insurance_policy, created_by, created_at
  )
  values (
    v_agency_id, 'Orizzonti Viaggi', 'Orizzonti Viaggi S.r.l.', 'IT03918470127', '03918470127',
    'VA-318742', 'Corso Giacomo Matteotti 48', '21100', 'Varese', 'VA', 'IT',
    'info@orizzontiviaggi.it', 'orizzontiviaggi@pec.it', '+39 0332 245 118',
    'https://www.orizzontiviaggi.it', 'IT60X0542811101000000123456', 'ordinario',
    'AUT-VA-2016-0421', 'Polizza RC professionale n. 4417-88231',
    v_owner_id, now() - interval '400 days'
  );

  insert into public.agency_settings (
    agency_id, deposit_due_days, balance_due_days_before_departure, deposit_percent_bps,
    supplier_alert_days, passenger_document_alert_days, default_vat_bps, default_sale_type,
    booking_number_prefix, quote_number_prefix, invoice_number_prefix, credit_note_number_prefix,
    quote_validity_days, hide_margins_from_operators, created_by
  )
  values (
    v_agency_id, 3, 30, 3000, '{7,3,0}', 30, 2200, 'intermediazione',
    '', 'P', '', 'NC', 14, false, v_owner_id
  );

  -- --- Utenti ----------------------------------------------------------------
  insert into public.memberships (agency_id, user_id, role, full_name, email, phone, job_title, created_by, created_at)
  values
    (v_agency_id, v_owner_id, 'titolare', 'Giulia Marchetti', 'titolare@orizzontiviaggi.it',
     '+39 335 218 9944', 'Titolare', v_owner_id, now() - interval '400 days'),
    (v_agency_id, v_admin_id, 'amministrativo', 'Paolo Ferrero', 'amministrativo@orizzontiviaggi.it',
     '+39 335 771 2210', 'Responsabile amministrativo', v_owner_id, now() - interval '380 days'),
    (v_agency_id, v_operator_id, 'operatore', 'Sara Bonomi', 'operatore@orizzontiviaggi.it',
     '+39 340 118 5522', 'Consulente di viaggio', v_owner_id, now() - interval '300 days');

  select id into v_m_owner from public.memberships where agency_id = v_agency_id and user_id = v_owner_id;
  select id into v_m_admin from public.memberships where agency_id = v_agency_id and user_id = v_admin_id;
  select id into v_m_operator from public.memberships where agency_id = v_agency_id and user_id = v_operator_id;

  -- --- Fornitori -------------------------------------------------------------
  insert into public.suppliers (
    agency_id, kind, name, legal_name, vat_number, email, phone, contact_name,
    city, province, iban, payment_terms_days, default_commission_bps, default_vat_regime, notes, created_by
  )
  values
    (v_agency_id, 'tour_operator', 'Mediterranea Tour', 'Mediterranea Tour S.p.A.', 'IT02114560159',
     'booking@mediterraneatour.it', '+39 02 4455 1100', 'Elena Colombo', 'Milano', 'MI',
     'IT12A0300203280000400551122', 30, 1200, 'art_74_ter', 'Commissione 12% sui pacchetti mare.', v_owner_id),
    (v_agency_id, 'tour_operator', 'Nordica Viaggi', 'Nordica Viaggi S.r.l.', 'IT03556780964',
     'agenzie@nordicaviaggi.it', '+39 02 3311 9080', 'Marco Villa', 'Milano', 'MI',
     'IT44B0542811101000000778899', 45, 1000, 'art_74_ter', 'Tour Nord Europa e capitali.', v_owner_id),
    (v_agency_id, 'tour_operator', 'Rotta Oriente', 'Rotta Oriente Travel S.r.l.', 'IT09887650158',
     'ops@rottaoriente.it', '+39 02 8899 4412', 'Chiara Sanna', 'Milano', 'MI',
     'IT88C0100003245000000112233', 30, 1400, 'art_74_ter', 'Asia e Medio Oriente, gruppi su richiesta.', v_owner_id),
    (v_agency_id, 'compagnia_aerea', 'Aerolinea Adriatica', 'Aerolinea Adriatica S.p.A.', 'IT01223440150',
     'trade@aeroadriatica.it', '+39 06 6501 2200', 'Ufficio Trade', 'Roma', 'RM',
     'IT21D0103003200000001234567', 7, 100, 'esente_art_10', 'Biglietteria BSP, commissione 1%.', v_owner_id),
    (v_agency_id, 'compagnia_aerea', 'SkyPonente Airlines', 'SkyPonente S.A.', 'ES-B12345678',
     'agency@skyponente.com', '+34 91 220 1144', 'Agency Desk', 'Madrid', null,
     null, 7, 0, 'esente_art_10', 'Low cost, nessuna commissione, fee di servizio agenzia.', v_owner_id),
    (v_agency_id, 'compagnia_marittima', 'Crociere Tirreniche', 'Crociere Tirreniche S.p.A.', 'IT04455660821',
     'agenzie@crocieretirreniche.it', '+39 010 553 2200', 'Davide Parodi', 'Genova', 'GE',
     'IT33E0569601600000002233445', 30, 1500, 'art_74_ter', 'Commissione 15% su crociere di listino.', v_owner_id),
    (v_agency_id, 'compagnia_ferroviaria', 'Rete Ferroviaria Europa', 'RFE Distribuzione S.r.l.', 'IT07788990163',
     'supporto@rfeuropa.it', '+39 02 7200 3311', 'Servizio Agenzie', 'Milano', 'MI',
     null, 15, 300, 'esente_art_10', 'Biglietteria ferroviaria nazionale e internazionale.', v_owner_id),
    (v_agency_id, 'hotel', 'Hotel Belvedere Taormina', 'Belvedere Hospitality S.r.l.', 'IT05566770833',
     'booking@belvederetaormina.it', '+39 0942 231 100', 'Rosa Cutrufelli', 'Taormina', 'ME',
     'IT09F0100016000000000998877', 14, 0, 'art_74_ter', 'Tariffe nette confidenziali.', v_owner_id),
    (v_agency_id, 'hotel', 'Residenza Cortina 1890', 'Cortina 1890 S.r.l.', 'IT02233440251',
     'reservations@cortina1890.it', '+39 0436 880 442', 'Luca De Zanna', 'Cortina d''Ampezzo', 'BL',
     'IT77G0306912345100000045612', 21, 0, 'art_74_ter', 'Stagione invernale, caparra 30%.', v_owner_id),
    (v_agency_id, 'dmc', 'Andalus DMC', 'Andalus Receptive S.L.', 'ES-B87654321',
     'ops@andalusdmc.es', '+34 95 421 7788', 'Beatriz Ruiz', 'Siviglia', null,
     null, 30, 0, 'art_74_ter', 'Servizi a terra Andalusia: guide, transfer, escursioni.', v_owner_id),
    (v_agency_id, 'dmc', 'Kilimangiaro Safari DMC', 'Kilimangiaro Safari Ltd', 'TZ-114-882-901',
     'reservations@kilisafari.co.tz', '+255 27 254 8890', 'Joseph Mwita', 'Arusha', null,
     null, 45, 0, 'art_74_ter', 'Safari Tanzania, pagamento 60 giorni prima dell''arrivo.', v_owner_id),
    (v_agency_id, 'assicurazione', 'Assicura Viaggi', 'Assicura Viaggi S.p.A.', 'IT06677880154',
     'agenzie@assicuraviaggi.it', '+39 02 6699 1122', 'Ufficio Convenzioni', 'Milano', 'MI',
     'IT51H0103003200000009988776', 30, 2500, 'esente_art_10', 'Polizze annullamento e medico-bagaglio, provvigione 25%.', v_owner_id),
    (v_agency_id, 'noleggio', 'AutoLibera Rent', 'AutoLibera Rent S.r.l.', 'IT08899001007',
     'partner@autolibera.it', '+39 06 4455 7788', 'Simone Iacovelli', 'Roma', 'RM',
     'IT62I0538703201000003344556', 30, 1000, 'art_74_ter', 'Noleggio auto Italia ed Europa.', v_owner_id),
    (v_agency_id, 'altro', 'Visti Rapidi Service', 'Visti Rapidi S.r.l.', 'IT01100220338',
     'pratiche@vistirapidi.it', '+39 02 3344 5566', 'Anna Ricci', 'Milano', 'MI',
     null, 15, 0, 'ordinaria', 'Pratiche consolari e visti elettronici.', v_owner_id);

  raise notice 'Seed: anagrafiche di base create.';
end;
$$;

-- =============================================================================
-- Clienti, passeggeri, pratiche, servizi, incassi, scadenze, fatture e task.
-- Generati in modo deterministico (setseed) perche' due installazioni mostrino
-- gli stessi numeri: il seed serve anche a verificare le prestazioni.
-- =============================================================================

do $$
declare
  v_agency_id   uuid := '11111111-1111-4111-8111-111111111111';
  v_owner_user  uuid := '22222222-2222-4222-8222-222222222221';
  v_admin_user  uuid := '22222222-2222-4222-8222-222222222222';
  v_oper_user   uuid := '22222222-2222-4222-8222-222222222223';
  v_m_owner     uuid;
  v_m_admin     uuid;
  v_m_operator  uuid;

  first_names text[] := array[
    'Marco','Giulia','Alessandro','Francesca','Luca','Chiara','Andrea','Elena','Matteo','Sara',
    'Davide','Martina','Simone','Alessia','Federico','Valentina','Riccardo','Silvia','Stefano','Laura',
    'Giorgio','Roberta','Antonio','Ilaria','Paolo','Beatrice','Nicola','Camilla','Emanuele','Serena'];
  last_names text[] := array[
    'Rossi','Bianchi','Ferrari','Esposito','Romano','Colombo','Ricci','Marino','Greco','Bruno',
    'Gallo','Conti','De Luca','Mancini','Costa','Giordano','Rizzo','Lombardi','Moretti','Barbieri',
    'Fontana','Santoro','Mariani','Rinaldi','Caruso','Ferrara','Galli','Martini','Leone','Longo'];
  companies text[] := array[
    'Meccanica Verbano S.r.l.','Studio Legale Bertoni e Associati','Tessitura Prealpina S.p.A.',
    'Cooperativa Sociale Il Faro','Istituto Comprensivo Dante Alighieri','Farmacie Riunite Varesine S.r.l.'];
  city_rows text[][] := array[
    array['Varese','VA','21100'], array['Milano','MI','20121'], array['Como','CO','22100'],
    array['Busto Arsizio','VA','21052'], array['Gallarate','VA','21013'], array['Saronno','VA','21047'],
    array['Legnano','MI','20025'], array['Novara','NO','28100'], array['Lecco','LC','23900'],
    array['Monza','MB','20900']];
  streets text[] := array[
    'Via Giuseppe Verdi','Corso Italia','Via Roma','Viale Belforte','Via San Michele',
    'Piazza della Repubblica','Via Dante','Via Cavour','Viale Europa','Via Manzoni'];

  -- destinazione, paese, prezzo lordo per persona (centesimi), tipo di vendita prevalente
  dest_names text[] := array[
    'Sharm el Sheikh, Mar Rosso','Maldive, Atollo di Malé Sud','Tour dell''Islanda',
    'Crociera Mediterraneo occidentale','New York e Washington','Safari in Tanzania e Zanzibar',
    'Andalusia in libertà','Capodanno a Cortina d''Ampezzo','Tour del Giappone classico',
    'Settimana a Taormina','Capitali baltiche','Marrakech e deserto dell''Agafay',
    'Lapponia, aurora boreale','Santorini e Mykonos','Viaggio di istruzione a Barcellona',
    'Ponte di primavera a Vienna','Tour della Giordania','Crociera sul Nilo',
    'Weekend a Parigi','Costiera Amalfitana'];
  dest_countries text[] := array[
    'EG','MV','IS','IT','US','TZ','ES','IT','JP','IT','LT','MA','FI','GR','ES','AT','JO','EG','FR','IT'];
  dest_prices bigint[] := array[
    89000,268000,219000,79000,159000,385000,118000,96000,349000,72000,
    142000,98000,189000,132000,42000,68000,164000,148000,52000,64000];

  v_customer_ids uuid[] := '{}';
  v_passenger_ids uuid[] := '{}';
  v_supplier_to uuid[] := '{}';
  v_supplier_air uuid[] := '{}';
  v_supplier_hotel uuid[] := '{}';
  v_supplier_ins uuid;
  v_supplier_dmc uuid[] := '{}';

  v_customer_id uuid;
  v_passenger_id uuid;
  v_booking_id uuid;
  v_plan_id uuid;
  v_invoice_id uuid;
  v_owner_membership uuid;
  v_service_id uuid;
  v_supplier_id uuid;

  i integer;
  j integer;
  v_kind app.customer_kind;
  v_first text;
  v_last text;
  v_city text[];
  v_dest_index integer;
  v_departure date;
  v_return date;
  v_pax integer;
  v_status app.booking_status;
  v_sale app.sale_type;
  v_unit_price bigint;
  v_unit_cost bigint;
  v_margin_bps integer;
  v_revenue bigint;
  v_cost bigint;
  v_commission bigint;
  v_deposit bigint;
  v_confirmed timestamptz;
  v_seq integer := 0;
begin
  perform setseed(0.4242);

  select id into v_m_owner from public.memberships where agency_id = v_agency_id and user_id = v_owner_user;
  select id into v_m_admin from public.memberships where agency_id = v_agency_id and user_id = v_admin_user;
  select id into v_m_operator from public.memberships where agency_id = v_agency_id and user_id = v_oper_user;

  select array_agg(id order by name) into v_supplier_to from public.suppliers
    where agency_id = v_agency_id and kind = 'tour_operator';
  select array_agg(id order by name) into v_supplier_air from public.suppliers
    where agency_id = v_agency_id and kind in ('compagnia_aerea', 'compagnia_ferroviaria', 'compagnia_marittima');
  select array_agg(id order by name) into v_supplier_hotel from public.suppliers
    where agency_id = v_agency_id and kind = 'hotel';
  select array_agg(id order by name) into v_supplier_dmc from public.suppliers
    where agency_id = v_agency_id and kind in ('dmc', 'noleggio');
  select id into v_supplier_ins from public.suppliers
    where agency_id = v_agency_id and kind = 'assicurazione' limit 1;

  -- --- 40 clienti ------------------------------------------------------------
  for i in 1..40 loop
    v_kind := case when i > 34 then 'azienda'::app.customer_kind else 'privato'::app.customer_kind end;
    v_first := first_names[1 + ((i * 7) % array_length(first_names, 1))];
    v_last := last_names[1 + ((i * 11) % array_length(last_names, 1))];
    v_city := city_rows[1 + (i % array_length(city_rows, 1))];

    insert into public.customers (
      agency_id, kind, first_name, last_name, company_name, vat_number, tax_code, sdi_code, pec,
      email, phone, mobile, address_line, postal_code, city, province, birth_date, notes, tags,
      privacy_consent_at, marketing_consent, marketing_consent_at, created_by, created_at
    )
    values (
      v_agency_id, v_kind,
      case when v_kind = 'privato' then v_first end,
      case when v_kind = 'privato' then v_last end,
      case when v_kind = 'azienda' then companies[i - 34] end,
      case when v_kind = 'azienda' then 'IT' || lpad((1000000000 + i * 137)::text, 11, '0') end,
      case when v_kind = 'privato'
           then upper(substr(v_last, 1, 3) || substr(v_first, 1, 3)) || lpad((60 + i)::text, 2, '0') || 'A01L682X'
      end,
      case when v_kind = 'azienda' then 'M5UXCR1' end,
      case when v_kind = 'azienda' then 'amministrazione' || i || '@pec.it' end,
      lower(regexp_replace(v_first || '.' || v_last, '[^a-zA-Z.]', '', 'g')) || i || '@example.it',
      '+39 0332 ' || lpad((100000 + i * 421)::text, 6, '0'),
      '+39 3' || lpad((30000000 + i * 918273)::text, 9, '0'),
      streets[1 + (i % array_length(streets, 1))] || ' ' || (1 + (i * 3) % 90),
      v_city[3], v_city[1], v_city[2],
      case when v_kind = 'privato' then date '1955-01-01' + ((i * 421) % 16000) end,
      case when i % 7 = 0 then 'Cliente storico, preferisce partenze di sabato.'
           when i % 11 = 0 then 'Richiede sempre assicurazione annullamento.' end,
      case when i % 5 = 0 then array['vip'] when i % 3 = 0 then array['famiglia'] else '{}'::text[] end,
      now() - (i || ' days')::interval,
      i % 3 <> 0,
      case when i % 3 <> 0 then now() - (i || ' days')::interval end,
      case when i % 4 = 0 then v_oper_user else v_owner_user end,
      now() - ((400 - i * 6) || ' days')::interval
    )
    returning id into v_customer_id;

    v_customer_ids := array_append(v_customer_ids, v_customer_id);

    -- Passeggero principale (coincide col cliente quando e' persona fisica)
    insert into public.passengers (
      agency_id, customer_id, first_name, last_name, birth_date, birth_place, gender, nationality,
      tax_code, email, phone, document_type, document_number, document_issued_at, document_expires_at,
      document_issuer, dietary_needs, created_by, created_at
    )
    values (
      v_agency_id, v_customer_id,
      case when v_kind = 'privato' then v_first else first_names[1 + (i % 30)] end,
      case when v_kind = 'privato' then v_last else last_names[1 + (i % 30)] end,
      date '1960-01-01' + ((i * 613) % 18000),
      v_city[1],
      case when i % 2 = 0 then 'F' else 'M' end,
      'IT',
      null,
      lower(regexp_replace(v_first || '.' || v_last, '[^a-zA-Z.]', '', 'g')) || i || '@example.it',
      '+39 3' || lpad((30000000 + i * 918273)::text, 9, '0'),
      case when i % 3 = 0 then 'carta_identita'::app.id_document_type else 'passaporto'::app.id_document_type end,
      case when i % 3 = 0 then 'CA' || lpad((1000000 + i * 733)::text, 7, '0')
           else 'YA' || lpad((2000000 + i * 913)::text, 7, '0') end,
      current_date - ((900 + i * 13) % 2500),
      -- alcuni documenti scadono a breve: alimentano l'alert "documento in scadenza"
      case when i % 9 = 0 then current_date + (10 + i) else current_date + (400 + i * 37) end,
      'Comune di ' || v_city[1],
      case when i % 8 = 0 then 'Intollerante al glutine' end,
      v_owner_user,
      now() - ((400 - i * 6) || ' days')::interval
    )
    returning id into v_passenger_id;

    v_passenger_ids := array_append(v_passenger_ids, v_passenger_id);

    -- Un familiare ogni due clienti privati
    if v_kind = 'privato' and i % 2 = 0 then
      insert into public.passengers (
        agency_id, customer_id, first_name, last_name, birth_date, birth_place, gender, nationality,
        document_type, document_number, document_issued_at, document_expires_at, document_issuer, created_by
      )
      values (
        v_agency_id, v_customer_id,
        first_names[1 + ((i * 3) % 30)], v_last,
        date '1985-01-01' + ((i * 317) % 12000), v_city[1],
        case when i % 4 = 0 then 'M' else 'F' end, 'IT',
        'passaporto', 'YA' || lpad((3000000 + i * 611)::text, 7, '0'),
        current_date - ((700 + i * 9) % 2200),
        current_date + (300 + i * 29),
        'Comune di ' || v_city[1], v_owner_user
      )
      returning id into v_passenger_id;
      v_passenger_ids := array_append(v_passenger_ids, v_passenger_id);
    end if;
  end loop;

  raise notice 'Seed: % clienti, % passeggeri.', array_length(v_customer_ids, 1), array_length(v_passenger_ids, 1);
end;
$$;

-- =============================================================================
-- 60 pratiche con servizi, passeggeri, piano rateale, incassi, pagamenti
-- fornitore, fatture, note di credito, task e registro attivita'.
-- =============================================================================

do $$
declare
  v_agency_id  uuid := '11111111-1111-4111-8111-111111111111';
  v_owner_user uuid := '22222222-2222-4222-8222-222222222221';
  v_admin_user uuid := '22222222-2222-4222-8222-222222222222';
  v_oper_user  uuid := '22222222-2222-4222-8222-222222222223';
  v_m_owner    uuid;
  v_m_admin    uuid;
  v_m_operator uuid;

  dest_names text[] := array[
    'Sharm el Sheikh, Mar Rosso','Maldive, Atollo di Malé Sud','Tour dell''Islanda',
    'Crociera Mediterraneo occidentale','New York e Washington','Safari in Tanzania e Zanzibar',
    'Andalusia in libertà','Capodanno a Cortina d''Ampezzo','Tour del Giappone classico',
    'Settimana a Taormina','Capitali baltiche','Marrakech e deserto dell''Agafay',
    'Lapponia, aurora boreale','Santorini e Mykonos','Viaggio di istruzione a Barcellona',
    'Ponte di primavera a Vienna','Tour della Giordania','Crociera sul Nilo',
    'Weekend a Parigi','Costiera Amalfitana'];
  dest_countries text[] := array[
    'EG','MV','IS','IT','US','TZ','ES','IT','JP','IT','LT','MA','FI','GR','ES','AT','JO','EG','FR','IT'];
  dest_prices bigint[] := array[
    89000,268000,219000,79000,159000,385000,118000,96000,349000,72000,
    142000,98000,189000,132000,42000,68000,164000,148000,52000,64000];

  v_customer_ids  uuid[];
  v_supplier_to   uuid[];
  v_supplier_air  uuid[];
  v_supplier_hotel uuid[];
  v_supplier_dmc  uuid[];
  v_supplier_ins  uuid;

  v_customer_id uuid;
  v_booking_id  uuid;
  v_plan_id     uuid;
  v_invoice_id  uuid;
  v_credit_id   uuid;
  v_owner_mem   uuid;
  v_actor_user  uuid;
  v_actor_label text;
  v_supplier_id uuid;
  v_service     record;

  i integer;
  v_dest integer;
  v_departure date;
  v_return date;
  v_pax integer;
  v_status app.booking_status;
  v_sale app.sale_type;
  v_confirmed timestamptz;
  v_unit_price bigint;
  v_commission_bps integer;
  v_revenue bigint;
  v_cost bigint;
  v_margin bigint;
  v_deposit bigint;
  v_balance bigint;
  v_deposit_due date;
  v_balance_due date;
  v_paid bigint;
  v_installment_deposit uuid;
  v_installment_balance uuid;
  v_created timestamptz;
begin
  perform setseed(0.777);

  select id into v_m_owner from public.memberships where agency_id = v_agency_id and user_id = v_owner_user;
  select id into v_m_admin from public.memberships where agency_id = v_agency_id and user_id = v_admin_user;
  select id into v_m_operator from public.memberships where agency_id = v_agency_id and user_id = v_oper_user;

  select array_agg(id order by created_at, id) into v_customer_ids
    from public.customers where agency_id = v_agency_id;
  select array_agg(id order by name) into v_supplier_to
    from public.suppliers where agency_id = v_agency_id and kind = 'tour_operator';
  select array_agg(id order by name) into v_supplier_air
    from public.suppliers where agency_id = v_agency_id
      and kind in ('compagnia_aerea','compagnia_ferroviaria','compagnia_marittima');
  select array_agg(id order by name) into v_supplier_hotel
    from public.suppliers where agency_id = v_agency_id and kind = 'hotel';
  select array_agg(id order by name) into v_supplier_dmc
    from public.suppliers where agency_id = v_agency_id and kind in ('dmc','noleggio');
  select id into v_supplier_ins from public.suppliers
    where agency_id = v_agency_id and kind = 'assicurazione' limit 1;

  for i in 1..60 loop
    v_dest := 1 + (i % 20);
    v_departure := current_date + (((i * 83) % 510) - 330);
    v_return := v_departure + (3 + (i % 12));
    v_pax := 1 + (i % 6);
    v_unit_price := dest_prices[v_dest];
    v_customer_id := v_customer_ids[1 + (i % array_length(v_customer_ids, 1))];
    v_sale := case when i % 3 = 0 then 'organizzazione'::app.sale_type else 'intermediazione'::app.sale_type end;

    if i % 4 = 0 then
      v_owner_mem := v_m_admin; v_actor_user := v_admin_user; v_actor_label := 'Paolo Ferrero';
    elsif i % 2 = 0 then
      v_owner_mem := v_m_operator; v_actor_user := v_oper_user; v_actor_label := 'Sara Bonomi';
    else
      v_owner_mem := v_m_owner; v_actor_user := v_owner_user; v_actor_label := 'Giulia Marchetti';
    end if;

    if i % 20 = 0 then
      v_status := 'annullata';
    elsif v_departure > current_date + 5 then
      v_status := case when i % 5 = 0 then 'opzione'::app.booking_status else 'confermata'::app.booking_status end;
    elsif v_departure > current_date then
      v_status := 'confermata';
    elsif v_return >= current_date then
      v_status := 'partita';
    else
      v_status := 'rientrata';
    end if;

    v_confirmed := case when v_status = 'opzione' then null
                        else (v_departure - 62)::timestamptz + interval '10 hours' end;
    v_created := coalesce(v_confirmed, now() - interval '5 days') - interval '4 days';

    insert into public.bookings (
      agency_id, customer_id, owner_id, title, destination, country, departure_date, return_date,
      pax_count, status, sale_type, notes, internal_notes, confirmed_at, cancelled_at,
      cancellation_reason, cancellation_penalty_cents, created_by, created_at
    )
    values (
      v_agency_id, v_customer_id, v_owner_mem,
      dest_names[v_dest] || ' · ' || v_pax || ' pax',
      dest_names[v_dest], dest_countries[v_dest], v_departure, v_return, v_pax, v_status, v_sale,
      case when i % 6 = 0 then 'Richiesta camera con vista mare e late check-out.' end,
      case when i % 9 = 0 then 'Cliente da richiamare per upgrade volo.' end,
      v_confirmed,
      case when v_status = 'annullata' then v_created + interval '20 days' end,
      case when v_status = 'annullata' then 'Rinuncia del cliente per motivi di salute documentati.' end,
      case when v_status = 'annullata' then (v_unit_price * v_pax * 15 / 100)::bigint else 0 end,
      v_actor_user, v_created
    )
    returning id into v_booking_id;

    -- --- Passeggeri della pratica --------------------------------------------
    insert into public.booking_passengers (agency_id, booking_id, passenger_id, role, created_by)
    select v_agency_id, v_booking_id, p.id,
           case when row_number() over (order by p.created_at, p.id) = 1
                then 'titolare'::app.passenger_role else 'accompagnatore'::app.passenger_role end,
           v_actor_user
    from public.passengers p
    where p.customer_id = v_customer_id
    limit greatest(1, least(v_pax, 2));

    -- --- Righe di servizio ----------------------------------------------------
    if v_sale = 'intermediazione' then
      -- Pacchetto di tour operator: il TO fattura al netto, il margine e' la commissione.
      v_commission_bps := 1000 + ((i * 7) % 600);
      v_supplier_id := v_supplier_to[1 + (i % array_length(v_supplier_to, 1))];
      insert into public.booking_services (
        agency_id, booking_id, service_type, supplier_id, description, details, confirmation_code,
        date_from, date_to, quantity, unit_cost_cents, unit_price_cents, commission_bps,
        vat_bps, vat_regime, supplier_due_date, sort_order, created_by, created_at
      )
      values (
        v_agency_id, v_booking_id, 'pacchetto', v_supplier_id,
        'Pacchetto ' || dest_names[v_dest],
        'Volo, trasferimenti e soggiorno come da programma del tour operator.',
        'TO-' || lpad((100000 + i * 37)::text, 6, '0'),
        v_departure, v_return, v_pax,
        (v_unit_price * (10000 - v_commission_bps) / 10000)::bigint, v_unit_price, 0,
        2200, 'fuori_campo', v_departure - 30, 1, v_actor_user, v_created
      );

      -- Polizza: ricavo puro da provvigione
      if i % 2 = 0 then
        insert into public.booking_services (
          agency_id, booking_id, service_type, supplier_id, description, details,
          date_from, date_to, quantity, unit_cost_cents, unit_price_cents, commission_bps,
          vat_bps, vat_regime, supplier_due_date, sort_order, created_by, created_at
        )
        values (
          v_agency_id, v_booking_id, 'assicurazione', v_supplier_ins,
          'Polizza annullamento e medico-bagaglio', 'Massimale spese mediche 100.000 €.',
          v_departure, v_return, v_pax, 4500, 4500, 2500,
          0, 'esente_art_10', v_departure - 15, 2, v_actor_user, v_created
        );
      end if;
    else
      -- Viaggio costruito su misura: piu' fornitori, IVA sul margine (74-ter).
      insert into public.booking_services (
        agency_id, booking_id, service_type, supplier_id, description, details, confirmation_code,
        date_from, date_to, quantity, unit_cost_cents, unit_price_cents, commission_bps,
        vat_bps, vat_regime, supplier_due_date, sort_order, created_by, created_at
      )
      values (
        v_agency_id, v_booking_id, 'volo', v_supplier_air[1 + (i % array_length(v_supplier_air, 1))],
        'Volo a/r ' || dest_names[v_dest], 'Bagaglio da stiva incluso, classe economica.',
        'PNR' || upper(substr(md5(v_booking_id::text), 1, 6)),
        v_departure, v_return, v_pax,
        (v_unit_price * 42 / 100)::bigint, (v_unit_price * 46 / 100)::bigint, 0,
        2200, 'art_74_ter', v_departure - 21, 1, v_actor_user, v_created
      );
      insert into public.booking_services (
        agency_id, booking_id, service_type, supplier_id, description, details, confirmation_code,
        date_from, date_to, quantity, unit_cost_cents, unit_price_cents, commission_bps,
        vat_bps, vat_regime, supplier_due_date, sort_order, created_by, created_at
      )
      values (
        v_agency_id, v_booking_id, 'hotel',
        v_supplier_hotel[1 + (i % array_length(v_supplier_hotel, 1))],
        'Soggiorno ' || (v_return - v_departure) || ' notti',
        'Camera doppia, trattamento di mezza pensione.',
        'HTL-' || lpad((20000 + i * 13)::text, 5, '0'),
        v_departure, v_return, v_pax,
        (v_unit_price * 38 / 100)::bigint, (v_unit_price * 44 / 100)::bigint, 0,
        2200, 'art_74_ter', v_departure - 14, 2, v_actor_user, v_created
      );
      insert into public.booking_services (
        agency_id, booking_id, service_type, supplier_id, description, details,
        date_from, date_to, quantity, unit_cost_cents, unit_price_cents, commission_bps,
        vat_bps, vat_regime, supplier_due_date, sort_order, created_by, created_at
      )
      values (
        v_agency_id, v_booking_id, 'transfer',
        v_supplier_dmc[1 + (i % array_length(v_supplier_dmc, 1))],
        'Trasferimenti e assistenza in loco', 'Transfer privato aeroporto/hotel a/r.',
        v_departure, v_return, v_pax,
        (v_unit_price * 7 / 100)::bigint, (v_unit_price * 11 / 100)::bigint, 0,
        2200, 'art_74_ter', v_departure - 10, 3, v_actor_user, v_created
      );
    end if;

    -- --- Quadro economico dalla vista ufficiale -------------------------------
    select revenue_cents, cost_cents, margin_cents
      into v_revenue, v_cost, v_margin
      from public.booking_financials where booking_id = v_booking_id;

    -- --- Piano rateale, incassi, pagamenti ------------------------------------
    if v_status <> 'opzione' then
      v_deposit := round(v_revenue * 0.30)::bigint;
      v_balance := v_revenue - v_deposit;
      v_deposit_due := (v_confirmed + interval '3 days')::date;
      v_balance_due := v_departure - 30;

      insert into public.installment_plans (agency_id, booking_id, source, created_by, created_at)
      values (v_agency_id, v_booking_id, 'automatico', v_actor_user, v_confirmed)
      returning id into v_plan_id;

      insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents, sort_order, created_by, created_at)
      values (v_agency_id, v_plan_id, v_booking_id, 'acconto', v_deposit_due, v_deposit, 1, v_actor_user, v_confirmed)
      returning id into v_installment_deposit;

      insert into public.installments (agency_id, plan_id, booking_id, kind, due_date, amount_cents, sort_order, created_by, created_at)
      values (v_agency_id, v_plan_id, v_booking_id, 'saldo', greatest(v_balance_due, v_deposit_due + 1), v_balance, 2, v_actor_user, v_confirmed)
      returning id into v_installment_balance;

      -- Acconto: incassato in tutte le pratiche confermate tranne poche morose
      if i % 11 <> 0 then
        insert into public.payments_in (
          agency_id, booking_id, installment_id, customer_id, kind, method, amount_cents,
          paid_at, reference, idempotency_key, created_by, created_at
        )
        values (
          v_agency_id, v_booking_id, v_installment_deposit, v_customer_id, 'acconto',
          case when i % 3 = 0 then 'bonifico'::app.payment_method else 'pos'::app.payment_method end,
          v_deposit, v_deposit_due, 'ACC-' || to_char(v_deposit_due, 'YYYYMMDD') || '-' || i,
          'seed-acconto-' || v_booking_id, v_admin_user, v_deposit_due::timestamptz
        );
      end if;

      -- Saldo: incassato per le pratiche gia' partite o rientrate (tranne alcune)
      if v_status in ('partita', 'rientrata') and i % 13 <> 0 then
        insert into public.payments_in (
          agency_id, booking_id, installment_id, customer_id, kind, method, amount_cents,
          paid_at, reference, idempotency_key, created_by, created_at
        )
        values (
          v_agency_id, v_booking_id, v_installment_balance, v_customer_id, 'saldo', 'bonifico',
          v_balance, greatest(v_balance_due, v_deposit_due + 1),
          'SLD-' || to_char(greatest(v_balance_due, v_deposit_due + 1), 'YYYYMMDD') || '-' || i,
          'seed-saldo-' || v_booking_id, v_admin_user,
          greatest(v_balance_due, v_deposit_due + 1)::timestamptz
        );
      end if;

      -- Annullamento: penale trattenuta e rimborso della differenza
      if v_status = 'annullata' then
        insert into public.payments_in (
          agency_id, booking_id, customer_id, kind, method, amount_cents, paid_at, reference,
          notes, idempotency_key, created_by, created_at
        )
        values (
          v_agency_id, v_booking_id, v_customer_id, 'rimborso', 'bonifico',
          -1 * greatest(v_deposit - round(v_revenue * 0.15)::bigint, 0),
          (v_created + interval '25 days')::date,
          'RIM-' || i, 'Rimborso al netto della penale del 15%.',
          'seed-rimborso-' || v_booking_id, v_admin_user, v_created + interval '25 days'
        );
      end if;
    end if;

    -- --- Pagamenti ai fornitori -----------------------------------------------
    for v_service in
      select s.id, s.supplier_id, s.total_cost_cents, s.supplier_due_date
      from public.booking_services s
      where s.booking_id = v_booking_id and s.supplier_id is not null and s.total_cost_cents > 0
    loop
      insert into public.payments_out (
        agency_id, booking_id, booking_service_id, supplier_id, amount_cents, due_date, paid_at,
        status, method, reference, supplier_invoice_number, idempotency_key, created_by, created_at
      )
      values (
        v_agency_id, v_booking_id, v_service.id, v_service.supplier_id, v_service.total_cost_cents,
        coalesce(v_service.supplier_due_date, v_departure - 20),
        case when v_status in ('partita', 'rientrata') then coalesce(v_service.supplier_due_date, v_departure - 20) end,
        case when v_status = 'annullata' then 'stornato'::app.payout_status
             when v_status in ('partita', 'rientrata') then 'pagato'::app.payout_status
             when coalesce(v_service.supplier_due_date, v_departure - 20) <= current_date + 7 then 'programmato'::app.payout_status
             else 'da_pagare'::app.payout_status end,
        'bonifico', 'DISP-' || upper(substr(md5(v_service.id::text), 1, 8)),
        'FT/' || to_char(coalesce(v_service.supplier_due_date, v_departure), 'YYYY') || '/' || (1000 + i),
        'seed-out-' || v_service.id, v_admin_user, v_created
      );
    end loop;

    -- --- Fatturazione ----------------------------------------------------------
    if v_status in ('partita', 'rientrata') then
      select coalesce(sum(amount_cents), 0) into v_paid
        from public.payments_in where booking_id = v_booking_id;

      insert into public.invoices (
        agency_id, kind, customer_id, booking_id, issue_date, due_date, status, vat_regime,
        payment_terms, notes, legal_notes, created_by, created_at
      )
      values (
        v_agency_id, 'fattura', v_customer_id, v_booking_id, v_departure - 25, v_departure - 5,
        case when v_paid >= v_revenue then 'pagata'::app.invoice_status else 'emessa'::app.invoice_status end,
        case when v_sale = 'organizzazione' then 'art_74_ter'::app.vat_regime else 'ordinaria'::app.vat_regime end,
        'Bonifico bancario a 30 giorni data fattura.',
        'Riferimento pratica ' || (select code from public.bookings where id = v_booking_id),
        case when v_sale = 'organizzazione'
             then 'Operazione soggetta al regime speciale delle agenzie di viaggio, art. 74-ter D.P.R. 633/72. IVA assolta dall''organizzatore sul margine.'
             else 'Provvigione soggetta a IVA ordinaria ai sensi dell''art. 3 D.P.R. 633/72.' end,
        v_admin_user, (v_departure - 25)::timestamptz
      )
      returning id into v_invoice_id;

      if v_sale = 'organizzazione' then
        -- 74-ter: imponibile = margine, IVA scorporata dal margine
        insert into public.invoice_items (
          agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
          vat_bps, vat_regime, sort_order, created_by
        )
        select v_agency_id, v_invoice_id, s.description, 1, s.total_price_cents, s.total_cost_cents,
               s.vat_bps, s.vat_regime, s.sort_order, v_admin_user
        from public.booking_services s
        where s.booking_id = v_booking_id
        order by s.sort_order;
      else
        -- Intermediazione: si fattura la commissione, IVA ordinaria
        insert into public.invoice_items (
          agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
          vat_bps, vat_regime, sort_order, created_by
        )
        values (
          v_agency_id, v_invoice_id,
          'Commissione di intermediazione su pratica ' ||
            (select code from public.bookings where id = v_booking_id),
          1, greatest(v_margin, 0), 0, 2200, 'ordinaria', 1, v_admin_user
        );
      end if;
    end if;

    -- Nota di credito sulle pratiche annullate che erano gia' state fatturate
    if v_status = 'annullata' and i % 40 = 0 then
      insert into public.invoices (
        agency_id, kind, customer_id, booking_id, issue_date, status, vat_regime,
        notes, legal_notes, created_by, created_at
      )
      values (
        v_agency_id, 'nota_credito', v_customer_id, v_booking_id, (v_created + interval '26 days')::date,
        'emessa', 'ordinaria', 'Storno per annullamento pratica.',
        'Nota di credito emessa ai sensi dell''art. 26 D.P.R. 633/72.',
        v_admin_user, v_created + interval '26 days'
      )
      returning id into v_credit_id;

      insert into public.invoice_items (
        agency_id, invoice_id, description, quantity, unit_price_cents, cost_cents,
        vat_bps, vat_regime, sort_order, created_by
      )
      values (
        v_agency_id, v_credit_id, 'Storno commissione per annullamento', 1,
        -1 * greatest(v_margin, 0), 0, 2200, 'ordinaria', 1, v_admin_user
      );
    end if;

    -- --- Task operativi --------------------------------------------------------
    if v_status = 'confermata' then
      insert into public.tasks (
        agency_id, title, description, kind, status, priority, due_at, assignee_id,
        booking_id, customer_id, created_by, created_at
      )
      values (
        v_agency_id,
        'Verifica documenti passeggeri',
        'Controllare la validità del passaporto di tutti i passeggeri fino al rientro.',
        'verifica_documenti', 'aperto',
        case when v_departure - current_date < 15 then 'alta'::app.task_priority else 'media'::app.task_priority end,
        (v_departure - 21)::timestamptz + interval '9 hours',
        v_owner_mem, v_booking_id, v_customer_id, v_actor_user, v_confirmed
      );
    end if;

    if v_status = 'confermata' and i % 7 = 0 then
      insert into public.tasks (
        agency_id, title, description, kind, status, priority, due_at, assignee_id,
        booking_id, customer_id, created_by, created_at
      )
      values (
        v_agency_id, 'Sollecito saldo al cliente',
        'Contattare il cliente per il saldo in scadenza.',
        'scadenza_saldo', 'aperto', 'alta',
        (v_departure - 33)::timestamptz + interval '10 hours',
        v_m_admin, v_booking_id, v_customer_id, v_admin_user, v_confirmed
      );
    end if;

    -- --- Registro attivita' ----------------------------------------------------
    insert into public.activity_log (
      agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, created_at
    )
    values (
      v_agency_id, v_actor_user, v_actor_label, 'creazione', 'bookings', v_booking_id,
      (select code from public.bookings where id = v_booking_id),
      'Creazione pratica ' || dest_names[v_dest], v_created
    );

    if v_confirmed is not null then
      insert into public.activity_log (
        agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, created_at
      )
      values (
        v_agency_id, v_actor_user, v_actor_label, 'cambio_stato', 'bookings', v_booking_id,
        (select code from public.bookings where id = v_booking_id),
        'Pratica confermata: generate scadenze acconto e saldo', v_confirmed
      );
    end if;

    if v_status = 'annullata' then
      insert into public.activity_log (
        agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, created_at
      )
      values (
        v_agency_id, v_admin_user, 'Paolo Ferrero', 'annullamento', 'bookings', v_booking_id,
        (select code from public.bookings where id = v_booking_id),
        'Annullamento con penale del 15% e rimborso della differenza', v_created + interval '20 days'
      );
    end if;
  end loop;

  raise notice 'Seed: 60 pratiche create.';
end;
$$;
