-- ============================================================================
-- Baseline schema.
--
-- The schema was previously created by hand in the Supabase dashboard and
-- existed only there. This reconstructs it as code so it can be recreated in a
-- local or staging database. Every statement is IF NOT EXISTS, so running it
-- against the existing production database changes nothing.
--
-- Column types were read from the live database, not guessed.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  contact    text,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.master_products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text,
  created_at timestamptz not null default now()
);

-- Maps the free-text product name a salesperson typed onto a canonical product,
-- so history for "O-Ring 25" and "Gasket 25mm Ring" aggregates together.
create table if not exists public.product_mappings (
  id                uuid primary key default gen_random_uuid(),
  raw_name          text not null unique,
  master_product_id uuid references public.master_products(id) on delete cascade
);

create table if not exists public.requirements (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  date       date not null default current_date,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists public.requirement_items (
  id                uuid primary key default gen_random_uuid(),
  requirement_id    uuid not null references public.requirements(id) on delete cascade,
  raw_product_name  text not null default '',
  quantity          numeric,
  unit              text
);

create table if not exists public.quotations (
  id             uuid primary key default gen_random_uuid(),
  requirement_id uuid references public.requirements(id) on delete set null,
  company_id     uuid references public.companies(id) on delete set null,
  date           date not null default current_date,
  status         text not null default 'pending',
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.quotation_items (
  id                uuid primary key default gen_random_uuid(),
  quotation_id      uuid not null references public.quotations(id) on delete cascade,
  raw_product_name  text not null default '',
  master_product_id uuid references public.master_products(id) on delete set null,
  quantity          numeric,
  unit              text,
  cost_price        numeric,
  quoted_price      numeric,
  margin            numeric,
  supplier_id       uuid references public.suppliers(id) on delete set null,
  item_status       text not null default 'pending'
);

create index if not exists quotation_items_quotation_idx on public.quotation_items (quotation_id);
create index if not exists quotation_items_master_product_idx on public.quotation_items (master_product_id);
create index if not exists quotation_items_supplier_idx on public.quotation_items (supplier_id);
create index if not exists quotations_company_idx on public.quotations (company_id);
create index if not exists quotations_date_idx on public.quotations (date desc);
create index if not exists requirement_items_requirement_idx on public.requirement_items (requirement_id);
