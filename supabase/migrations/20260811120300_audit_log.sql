-- ============================================================================
-- Audit trail.
--
-- With one user, nobody asks who changed a price. With five, "who dropped this
-- quote by 8%?" gets asked in month two — and margins are the asset here, so
-- not being able to answer is a real problem.
--
-- The log is append-only from the application's point of view: the trigger
-- writes it, and there is no insert/update/delete policy for anyone.
-- ============================================================================

create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organisations(id) on delete cascade,
  table_name     text not null,
  row_id         uuid not null,
  action         text not null check (action in ('insert', 'update', 'delete')),
  changed_by     uuid references auth.users(id),
  changed_at     timestamptz not null default now(),
  changed_fields text[],
  before         jsonb,
  after          jsonb
);

create index if not exists audit_log_org_time_idx on public.audit_log (org_id, changed_at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id, changed_at desc);

comment on table public.audit_log is
  'Append-only record of who changed which row, and what changed.';

-- Columns whose churn would drown the log without telling anyone anything.
create or replace function public.audit_ignored_columns()
returns text[]
language sql
immutable
as $$ select array['updated_at', 'updated_by', 'created_at'] $$;

create or replace function public.audit_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[] := '{}';
  v_key     text;
  v_org     uuid;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_org := (v_after ->> 'org_id')::uuid;
  elsif tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_org := (v_before ->> 'org_id')::uuid;
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_org := (v_after ->> 'org_id')::uuid;

    for v_key in select jsonb_object_keys(v_after) loop
      if v_key = any (public.audit_ignored_columns()) then
        continue;
      end if;
      if (v_before -> v_key) is distinct from (v_after -> v_key) then
        v_changed := array_append(v_changed, v_key);
      end if;
    end loop;

    -- Nothing of substance changed; don't write a row.
    if array_length(v_changed, 1) is null then
      return new;
    end if;

    -- Keep only what moved, so the log stays readable and small.
    v_before := (select jsonb_object_agg(k, v_before -> k) from unnest(v_changed) k);
    v_after  := (select jsonb_object_agg(k, v_after  -> k) from unnest(v_changed) k);
  end if;

  insert into public.audit_log (org_id, table_name, row_id, action, changed_by, changed_fields, before, after)
  values (
    v_org,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid),
    lower(tg_op),
    auth.uid(),
    nullif(v_changed, '{}'),
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare
  t text;
  audited text[] := array[
    'quotations', 'quotation_items', 'companies', 'suppliers', 'master_products'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists audit_change_trg on public.%I', t);
    execute format(
      'create trigger audit_change_trg after insert or update or delete on public.%I
         for each row execute function public.audit_change()', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------ RLS -----
alter table public.audit_log enable row level security;

-- Readable by the organisation it belongs to. Deliberately no write policies:
-- only the SECURITY DEFINER trigger appends, so history cannot be rewritten.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.audit_log from anon;

-- History for one row, newest first — powers the "who changed this?" panel.
create or replace function public.row_history(p_table text, p_row_id uuid)
returns setof public.audit_log
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select * from public.audit_log
  where table_name = p_table and row_id = p_row_id
  order by changed_at desc
  limit 100;
$$;

grant execute on function public.row_history(text, uuid) to authenticated;
