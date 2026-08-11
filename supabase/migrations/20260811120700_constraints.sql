-- ============================================================================
-- Data integrity constraints.
--
-- Four pages currently deduplicate companies and products by lowercased name
-- in JavaScript before rendering. That is a workaround for the database
-- allowing the duplicates in the first place. This merges the existing ones and
-- then stops new ones being created.
--
-- The merge runs before the unique index, because adding the index to a table
-- that already contains duplicates would fail the migration.
-- ============================================================================

-- ------------------------------------------------------ merge duplicates ----
-- Keeps the oldest row of each name, repoints every reference to it, and soft
-- deletes the rest. Nothing is destroyed.
do $$
declare r record;
begin
  -- companies
  for r in
    select org_id, lower(trim(name)) as key,
           (array_agg(id order by created_at))[1] as keep_id,
           array_agg(id order by created_at) as all_ids
    from public.companies
    where deleted_at is null
    group by org_id, lower(trim(name))
    having count(*) > 1
  loop
    update public.quotations set company_id = r.keep_id
      where company_id = any (r.all_ids) and company_id <> r.keep_id;
    update public.requirements set company_id = r.keep_id
      where company_id = any (r.all_ids) and company_id <> r.keep_id;
    update public.companies set deleted_at = now()
      where id = any (r.all_ids) and id <> r.keep_id;
    raise notice 'merged % duplicate companies named %', array_length(r.all_ids, 1) - 1, r.key;
  end loop;

  -- suppliers
  for r in
    select org_id, lower(trim(name)) as key,
           (array_agg(id order by created_at))[1] as keep_id,
           array_agg(id order by created_at) as all_ids
    from public.suppliers
    where deleted_at is null
    group by org_id, lower(trim(name))
    having count(*) > 1
  loop
    update public.quotation_items set supplier_id = r.keep_id
      where supplier_id = any (r.all_ids) and supplier_id <> r.keep_id;
    update public.suppliers set deleted_at = now()
      where id = any (r.all_ids) and id <> r.keep_id;
    raise notice 'merged % duplicate suppliers named %', array_length(r.all_ids, 1) - 1, r.key;
  end loop;

  -- master products
  for r in
    select org_id, lower(trim(name)) as key,
           (array_agg(id order by created_at))[1] as keep_id,
           array_agg(id order by created_at) as all_ids
    from public.master_products
    where deleted_at is null
    group by org_id, lower(trim(name))
    having count(*) > 1
  loop
    update public.quotation_items set master_product_id = r.keep_id
      where master_product_id = any (r.all_ids) and master_product_id <> r.keep_id;
    update public.product_mappings set master_product_id = r.keep_id
      where master_product_id = any (r.all_ids) and master_product_id <> r.keep_id;
    update public.master_products set deleted_at = now()
      where id = any (r.all_ids) and id <> r.keep_id;
    raise notice 'merged % duplicate products named %', array_length(r.all_ids, 1) - 1, r.key;
  end loop;
end $$;

-- ----------------------------------------------------------- constraints ----
-- Unique per organisation, case-insensitively, ignoring deleted rows.
create unique index if not exists companies_org_name_key
  on public.companies (org_id, lower(trim(name))) where deleted_at is null;

create unique index if not exists suppliers_org_name_key
  on public.suppliers (org_id, lower(trim(name))) where deleted_at is null;

create unique index if not exists master_products_org_name_key
  on public.master_products (org_id, lower(trim(name))) where deleted_at is null;

-- ---------------------------------------------------------------- sanity ----
-- Cheap guards against nonsense that would corrupt the pricing intelligence.
do $$ begin
  alter table public.quotation_items
    add constraint quotation_items_quantity_positive check (quantity is null or quantity >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quotation_items
    add constraint quotation_items_prices_non_negative
    check ((cost_price is null or cost_price >= 0) and (quoted_price is null or quoted_price >= 0));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quotation_items
    add constraint quotation_items_status_valid
    check (item_status in ('pending', 'won', 'lost'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.quotations
    add constraint quotations_status_valid
    check (status in ('pending', 'won', 'lost', 'partial_win'));
exception when duplicate_object then null; end $$;
