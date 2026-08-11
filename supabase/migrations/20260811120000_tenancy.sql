-- ============================================================================
-- Multi-tenancy foundation.
--
-- Before this migration every row in the database belonged to everybody: there
-- was no account concept at all, so a second customer could not be onboarded
-- without mixing their cost prices into the same tables. This adds
-- organisations, memberships, and an org_id on every business table.
--
-- The org_id is set by a column DEFAULT that reads the caller's membership, so
-- the client never sends it and cannot spoof it. RLS (next migration) then
-- enforces that you may only touch rows whose org_id is your own.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- roles -----
do $$ begin
  create type public.app_role as enum ('owner', 'manager', 'sales');
exception when duplicate_object then null;
end $$;

-- -------------------------------------------------------- organisations -----
create table if not exists public.organisations (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (length(trim(name)) > 0),
  slug                      text unique,
  gstin                     text,
  address                   text,
  logo_url                  text,
  currency                  text not null default 'INR',
  plan                      text not null default 'trial',
  plan_status               text not null default 'trialing',
  trial_ends_at             timestamptz default (now() + interval '14 days'),
  seats_purchased           integer not null default 2,
  ai_pages_used_this_period integer not null default 0,
  created_at                timestamptz not null default now()
);

comment on table public.organisations is
  'One customer account. Every business row belongs to exactly one of these.';

-- ----------------------------------------------------------- membership -----
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.app_role not null default 'sales',
  invited_by  uuid references auth.users(id),
  invited_at  timestamptz,
  accepted_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- One org per user for now. Drop this index when org switching is built.
create unique index if not exists memberships_one_org_per_user
  on public.memberships (user_id);

-- ------------------------------------------------------------ helpers -------
-- SECURITY DEFINER so these can read memberships without tripping the RLS
-- policies that are themselves defined in terms of these functions.

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from public.memberships where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.memberships where user_id = auth.uid() limit 1;
$$;

-- Cost price and margin are the most sensitive numbers a trading company owns.
-- Salespeople are deliberately not shown them.
create or replace function public.can_see_cost()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() in ('owner', 'manager'), false);
$$;

-- --------------------------------------------------- org_id everywhere ------
do $$
declare
  t text;
  business_tables text[] := array[
    'companies', 'suppliers', 'master_products', 'product_mappings',
    'quotations', 'quotation_items', 'requirements', 'requirement_items'
  ];
begin
  foreach t in array business_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, table does not exist', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists org_id uuid references public.organisations(id) on delete cascade',
      t
    );
    execute format(
      'alter table public.%I alter column org_id set default public.current_org_id()',
      t
    );
    execute format(
      'create index if not exists %I on public.%I (org_id)',
      t || '_org_idx', t
    );
  end loop;
end $$;

-- ------------------------------------------------------------ backfill ------
-- Existing rows predate tenancy. Park them all in one organisation so the
-- current production data keeps working, then make org_id mandatory.
do $$
declare
  v_org  uuid;
  v_rows bigint;
begin
  select count(*) into v_rows from public.quotations where org_id is null;
  if v_rows = 0 then
    select count(*) into v_rows from public.companies where org_id is null;
  end if;

  if v_rows > 0 then
    insert into public.organisations (name, slug)
    values ('Industrial Rubber Products', 'industrial-rubber-products')
    returning id into v_org;

    update public.companies       set org_id = v_org where org_id is null;
    update public.suppliers       set org_id = v_org where org_id is null;
    update public.master_products set org_id = v_org where org_id is null;
    update public.product_mappings set org_id = v_org where org_id is null;
    update public.quotations      set org_id = v_org where org_id is null;
    update public.quotation_items set org_id = v_org where org_id is null;

    if to_regclass('public.requirements') is not null then
      update public.requirements      set org_id = v_org where org_id is null;
      update public.requirement_items set org_id = v_org where org_id is null;
    end if;

    raise notice 'Backfilled existing data into organisation %', v_org;
  end if;
end $$;

do $$
declare
  t text;
  business_tables text[] := array[
    'companies', 'suppliers', 'master_products', 'product_mappings',
    'quotations', 'quotation_items', 'requirements', 'requirement_items'
  ];
begin
  foreach t in array business_tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I alter column org_id set not null', t);
  end loop;
end $$;

-- --------------------------------------------- per-org uniqueness ----------
-- product_mappings was unique on raw_name globally, which would collide the
-- moment two customers both quote "O-Ring 25". Scope it to the organisation.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.product_mappings'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.product_mappings drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists product_mappings_org_raw_name_key
  on public.product_mappings (org_id, raw_name);

-- ------------------------------------------------------- onboarding --------
-- A brand-new user has no organisation. This is the only way to create one:
-- it makes the caller the owner and refuses if they already belong somewhere.
create or replace function public.create_organisation(p_name text)
returns public.organisations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org public.organisations;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an organisation';
  end if;

  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    raise exception 'You already belong to an organisation';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Organisation name is required';
  end if;

  insert into public.organisations (name)
  values (trim(p_name))
  returning * into v_org;

  insert into public.memberships (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  return v_org;
end $$;

revoke all on function public.create_organisation(text) from public, anon;
grant execute on function public.create_organisation(text) to authenticated;

-- ------------------------------------------- cost-price write guard --------
-- Salespeople must not be able to change cost or margin. Rather than failing
-- the whole save, silently keep the existing values so the rest of their edit
-- still lands.
create or replace function public.guard_cost_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No signed-in user means this is a migration, a bulk import, or a
  -- service-role job — not a salesperson. Without this check the guard would
  -- silently NULL the cost price on every imported row, destroying exactly the
  -- history the product is built on.
  if auth.uid() is null then
    return new;
  end if;

  if public.can_see_cost() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.cost_price := null;
    new.margin := null;
  else
    new.cost_price := old.cost_price;
    new.margin := old.margin;
  end if;

  return new;
end $$;

drop trigger if exists guard_cost_price_trg on public.quotation_items;
create trigger guard_cost_price_trg
  before insert or update on public.quotation_items
  for each row execute function public.guard_cost_price();
