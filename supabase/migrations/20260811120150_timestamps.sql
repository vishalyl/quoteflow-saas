-- ============================================================================
-- Change tracking columns.
--
-- Needed before anything can be concurrent: with several salespeople editing
-- the same quotation, "when was this row last touched, and by whom" is the
-- difference between detecting a collision and silently losing someone's work.
-- ============================================================================

alter table public.quotations
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

alter table public.quotation_items
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id);

alter table public.companies
  add column if not exists updated_at timestamptz not null default now();

alter table public.suppliers
  add column if not exists updated_at timestamptz not null default now();

alter table public.master_products
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Only stamp the editor on tables that track one.
  if to_jsonb(new) ? 'updated_by' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

do $$
declare
  t text;
  tables text[] := array[
    'quotations', 'quotation_items', 'companies', 'suppliers', 'master_products'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists touch_row_trg on public.%I', t);
    execute format(
      'create trigger touch_row_trg before update on public.%I
         for each row execute function public.touch_row()', t
    );
  end loop;
end $$;
