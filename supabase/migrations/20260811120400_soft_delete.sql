-- ============================================================================
-- Soft deletes.
--
-- Deleting a quotation used to be permanent, guarded only by a browser confirm
-- dialog. On a shared account that is one mis-click away from destroying a
-- colleague's work with no way back.
--
-- Deleted rows stay in the table but drop out of every query automatically,
-- because the RLS policy itself excludes them — so this needed no changes at
-- any of the ~30 call sites. Restore goes through a SECURITY DEFINER function
-- that can see past the policy.
-- ============================================================================

alter table public.quotations     add column if not exists deleted_at timestamptz;
alter table public.companies      add column if not exists deleted_at timestamptz;
alter table public.suppliers      add column if not exists deleted_at timestamptz;
alter table public.master_products add column if not exists deleted_at timestamptz;

create index if not exists quotations_live_idx      on public.quotations (org_id) where deleted_at is null;
create index if not exists companies_live_idx       on public.companies (org_id) where deleted_at is null;
create index if not exists suppliers_live_idx       on public.suppliers (org_id) where deleted_at is null;
create index if not exists master_products_live_idx on public.master_products (org_id) where deleted_at is null;

-- Replace the plain isolation policy on soft-deletable tables so deleted rows
-- become invisible. WITH CHECK deliberately omits the deleted_at test, or the
-- update that performs the soft delete would be rejected by its own policy.
do $$
declare
  t text;
  soft_tables text[] := array['quotations', 'companies', 'suppliers', 'master_products'];
begin
  foreach t in array soft_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.current_org_id() and deleted_at is null)
        with check (org_id = public.current_org_id())
    $f$, t || '_org_isolation', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- delete ----
-- SECURITY DEFINER, with the organisation checked explicitly below.
--
-- It cannot be SECURITY INVOKER: the policy above only permits rows that are
-- NOT deleted, and Postgres applies that condition to the row as it will be
-- after the update — so setting deleted_at makes the row fail the very policy
-- that authorises the write. The policy that hides deleted rows would forbid
-- anything from ever becoming deleted. Restore has the same problem, which is
-- why it is written the same way.
create or replace function public.soft_delete(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org     uuid := public.current_org_id();
  v_row_org uuid;
begin
  if p_table not in ('quotations', 'companies', 'suppliers', 'master_products') then
    raise exception 'Cannot delete from %', p_table;
  end if;
  if v_org is null then
    raise exception 'You must belong to an organisation';
  end if;

  -- Bypassing RLS means doing its job by hand: never touch another org's row.
  execute format('select org_id from public.%I where id = $1 and deleted_at is null', p_table)
    into v_row_org using p_id;

  if v_row_org is null or v_row_org <> v_org then
    raise exception 'Not found';
  end if;

  execute format('update public.%I set deleted_at = now() where id = $1', p_table)
    using p_id;
end $$;

grant execute on function public.soft_delete(text, uuid) to authenticated;

-- --------------------------------------------------------------- restore ----
-- SECURITY DEFINER because the row is invisible to the caller by now; the
-- org check is therefore done explicitly rather than left to the policy.
create or replace function public.restore_deleted(p_table text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org_id();
  v_row_org uuid;
begin
  if p_table not in ('quotations', 'companies', 'suppliers', 'master_products') then
    raise exception 'Cannot restore from %', p_table;
  end if;
  if v_org is null then
    raise exception 'You must belong to an organisation';
  end if;

  execute format('select org_id from public.%I where id = $1', p_table)
    into v_row_org using p_id;

  if v_row_org is null or v_row_org <> v_org then
    raise exception 'Not found';
  end if;

  execute format('update public.%I set deleted_at = null where id = $1', p_table)
    using p_id;
end $$;

grant execute on function public.restore_deleted(text, uuid) to authenticated;

-- ----------------------------------------------------------------- trash ----
create or replace function public.list_deleted()
returns table (table_name text, id uuid, label text, deleted_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid := public.current_org_id();
begin
  if v_org is null then return; end if;

  return query
    select 'quotations'::text, q.id,
           coalesce(c.name, 'No company') || ' · ' || q.date::text,
           q.deleted_at
    from public.quotations q
    left join public.companies c on c.id = q.company_id
    where q.org_id = v_org and q.deleted_at is not null
  union all
    select 'companies'::text, x.id, x.name, x.deleted_at
    from public.companies x where x.org_id = v_org and x.deleted_at is not null
  union all
    select 'suppliers'::text, x.id, x.name, x.deleted_at
    from public.suppliers x where x.org_id = v_org and x.deleted_at is not null
  union all
    select 'master_products'::text, x.id, x.name, x.deleted_at
    from public.master_products x where x.org_id = v_org and x.deleted_at is not null
  order by 4 desc;
end $$;

grant execute on function public.list_deleted() to authenticated;
