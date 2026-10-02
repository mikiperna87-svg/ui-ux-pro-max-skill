-- =============================================================================
-- 0006 — RPC di bootstrap, Storage privato, grant.
-- =============================================================================

-- --- Creazione agenzia + titolare in un'unica transazione ---------------------
-- SECURITY DEFINER perche' deve creare le righe prima che esista una membership
-- (senza membership, la RLS non permetterebbe alcuna scrittura).
create or replace function public.create_agency_with_owner(
  p_agency_name text,
  p_full_name text,
  p_vat_number text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_agency_id uuid;
  v_email text;
begin
  if v_user_id is null then
    raise exception 'Utente non autenticato' using errcode = 'insufficient_privilege';
  end if;

  if length(btrim(coalesce(p_agency_name, ''))) < 2 then
    raise exception 'Il nome dell agenzia e obbligatorio';
  end if;

  -- Un utente non puo' creare una seconda agenzia se ne ha gia' una attiva:
  -- scelta conservativa, l'ingresso in altre agenzie avviene per invito.
  if exists (
    select 1 from public.memberships m
    where m.user_id = v_user_id and m.is_active and m.deleted_at is null
  ) then
    raise exception 'Questo utente appartiene gia a un agenzia';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;

  insert into public.agencies (name, legal_name, vat_number, email, created_by)
  values (btrim(p_agency_name), btrim(p_agency_name), nullif(btrim(coalesce(p_vat_number, '')), ''),
          coalesce(nullif(btrim(coalesce(p_email, '')), ''), v_email), v_user_id)
  returning id into v_agency_id;

  insert into public.agency_settings (agency_id, created_by)
  values (v_agency_id, v_user_id);

  insert into public.memberships (agency_id, user_id, role, full_name, email, created_by)
  values (v_agency_id, v_user_id, 'titolare',
          coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), 'Titolare'),
          coalesce(v_email, ''), v_user_id);

  insert into public.activity_log (agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary)
  values (v_agency_id, v_user_id, coalesce(p_full_name, 'Titolare'), 'creazione', 'agencies', v_agency_id,
          btrim(p_agency_name), 'Creazione dell agenzia e del profilo titolare');

  return v_agency_id;
end;
$$;

comment on function public.create_agency_with_owner is
  'Crea agenzia, impostazioni e membership titolare in transazione. Unico ingresso consentito per una nuova agenzia.';

-- --- Registro attivita': scrittura applicativa --------------------------------
create or replace function public.log_activity(
  p_agency_id uuid,
  p_action app.activity_action,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_label text,
  p_summary text,
  p_before jsonb default null,
  p_after jsonb default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
  v_label text;
begin
  select m.full_name into v_label
  from public.memberships m
  where m.user_id = auth.uid() and m.agency_id = p_agency_id and m.deleted_at is null
  limit 1;

  insert into public.activity_log (
    agency_id, actor_id, actor_label, action, entity_type, entity_id, entity_label, summary, before_data, after_data
  )
  values (
    p_agency_id, auth.uid(), coalesce(v_label, 'sistema'), p_action, p_entity_type, p_entity_id,
    p_entity_label, p_summary, p_before, p_after
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- --- Storage: bucket privato dei documenti ------------------------------------
-- I file sono organizzati come <agency_id>/<entita>/<id>/<file>, cosi' la prima
-- cartella e' il tenant e la policy puo' verificarlo senza join.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'documenti', 'documenti', false, 20971520,
      array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $policy$
      drop policy if exists documenti_select on storage.objects;
      create policy documenti_select on storage.objects for select to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1]::uuid in (select app.current_agency_ids())
        );

      drop policy if exists documenti_insert on storage.objects;
      create policy documenti_insert on storage.objects for insert to authenticated
        with check (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1]::uuid in (select app.current_agency_ids())
          and app.can_write((storage.foldername(name))[1]::uuid)
        );

      drop policy if exists documenti_update on storage.objects;
      create policy documenti_update on storage.objects for update to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1]::uuid in (select app.current_agency_ids())
          and app.can_write((storage.foldername(name))[1]::uuid)
        );

      drop policy if exists documenti_delete on storage.objects;
      create policy documenti_delete on storage.objects for delete to authenticated
        using (
          bucket_id = 'documenti'
          and (storage.foldername(name))[1]::uuid in (select app.current_agency_ids())
          and app.has_role((storage.foldername(name))[1]::uuid, 'titolare', 'amministrativo')
        );
    $policy$;
  end if;
end;
$$;

-- --- Grant --------------------------------------------------------------------
grant usage on schema app to authenticated, anon, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.create_agency_with_owner(text, text, text, text) to authenticated;
grant execute on function public.log_activity(uuid, app.activity_action, text, uuid, text, text, jsonb, jsonb) to authenticated;

grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
