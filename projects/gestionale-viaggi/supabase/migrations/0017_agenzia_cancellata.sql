-- ============================================================================
-- 0017 — Un'agenzia cancellata sparisce davvero
--
-- `agencies.deleted_at` esisteva dalla 0002 e non la guardava nessuno: si
-- poteva marcare un'agenzia come cancellata e i suoi membri continuavano a
-- entrare, leggere e scrivere. Una colonna che dice una cosa e non la fa e'
-- peggio di una colonna che non c'e'.
--
-- Il controllo va qui e non nel codice dell'applicazione: `current_agency_ids()`
-- e `current_role()` sono la porta da cui passa ogni policy di questo schema.
-- Chiudendola qui, la cancellazione vale per le venticinque tabelle in una
-- volta sola — comprese le query che nessuno ha ancora scritto.
-- ============================================================================

create or replace function app.current_agency_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.agency_id
  from public.memberships m
  join public.agencies a on a.id = m.agency_id
  where m.user_id = auth.uid()
    and m.is_active
    and m.deleted_at is null
    and a.deleted_at is null;
$$;

create or replace function app.current_role(p_agency_id uuid)
returns app.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.memberships m
  join public.agencies a on a.id = m.agency_id
  where m.user_id = auth.uid()
    and m.agency_id = p_agency_id
    and m.is_active
    and m.deleted_at is null
    and a.deleted_at is null
  limit 1;
$$;

create or replace function app.current_membership_id(p_agency_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.memberships m
  join public.agencies a on a.id = m.agency_id
  where m.user_id = auth.uid()
    and m.agency_id = p_agency_id
    and m.is_active
    and m.deleted_at is null
    and a.deleted_at is null
  limit 1;
$$;

-- `has_role`, `can_write`, `can_manage_accounting` e `is_owner` leggono tutte
-- `current_role`: si adeguano da sole, senza essere toccate.

comment on function app.current_agency_ids() is
  'Agenzie vive a cui l''utente autenticato appartiene con una membership attiva.';
