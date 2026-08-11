-- ============================================================================
-- Cross-tenant isolation test.
--
-- Run against a local database with the migrations applied:
--   npx supabase db reset
--   psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/tenant_isolation.sql
--
-- Every check raises an exception on failure, so a clean run means all passed.
-- ============================================================================

begin;

-- Two users in two different organisations.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@test.local', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@test.local', '', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sales-a@test.local', '', now(), now(), now())
on conflict (id) do nothing;

create or replace function pg_temp.become(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.check_that(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;

-- ---------------------------------------------------------------- setup -----
do $$
declare v_org_a uuid; v_org_b uuid;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  select id into v_org_a from public.create_organisation('Alpha Traders');
  insert into public.companies (name) values ('Alpha Client');

  perform pg_temp.become('22222222-2222-2222-2222-222222222222');
  select id into v_org_b from public.create_organisation('Beta Traders');
  insert into public.companies (name) values ('Beta Client');

  raise notice 'org A = %, org B = %', v_org_a, v_org_b;
end $$;

-- ------------------------------------------------------- the actual tests ---
do $$
declare
  v_count integer;
  v_org_b uuid;
  v_beta_company uuid;
  v_failed boolean;
begin
  -- 1. org_id is stamped automatically, not sent by the client
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  select count(*) into v_count from public.companies where org_id is null;
  perform pg_temp.check_that(v_count = 0, 'org_id is set automatically on insert');

  -- 2. A sees only A's rows
  select count(*) into v_count from public.companies;
  perform pg_temp.check_that(v_count = 1, 'user A sees only their own company');

  select count(*) into v_count from public.companies where name = 'Beta Client';
  perform pg_temp.check_that(v_count = 0, 'user A cannot read org B rows');

  -- 3. B likewise
  perform pg_temp.become('22222222-2222-2222-2222-222222222222');
  select count(*) into v_count from public.companies;
  perform pg_temp.check_that(v_count = 1, 'user B sees only their own company');
  select id, org_id into v_beta_company, v_org_b from public.companies limit 1;

  -- 4. A cannot update B's row (invisible rows match nothing)
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  update public.companies set name = 'HIJACKED' where id = v_beta_company;
  get diagnostics v_count = row_count;
  perform pg_temp.check_that(v_count = 0, 'user A cannot update org B rows');

  -- 5. A cannot delete B's row
  delete from public.companies where id = v_beta_company;
  get diagnostics v_count = row_count;
  perform pg_temp.check_that(v_count = 0, 'user A cannot delete org B rows');

  -- 6. A cannot forge a row into org B (WITH CHECK must reject it)
  v_failed := false;
  begin
    insert into public.companies (name, org_id) values ('Smuggled', v_org_b);
  exception when insufficient_privilege or check_violation then
    v_failed := true;
  end;
  perform pg_temp.check_that(v_failed, 'user A cannot insert into org B');

  -- 7. create_organisation refuses a second org for the same user
  v_failed := false;
  begin
    perform public.create_organisation('Sneaky Second Org');
  exception when others then
    v_failed := true;
  end;
  perform pg_temp.check_that(v_failed, 'a user cannot create a second organisation');
end $$;

-- --------------------------------------------------- cost-price guard -------
do $$
declare
  v_org_a uuid;
  v_quote uuid;
  v_item uuid;
  v_cost numeric;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  select org_id into v_org_a from public.companies limit 1;

  insert into public.quotations (date, status) values (current_date, 'pending')
  returning id into v_quote;
  insert into public.quotation_items (quotation_id, raw_product_name, cost_price, quoted_price, margin)
  values (v_quote, 'Gasket 25mm', 100, 120, 20)
  returning id into v_item;

  select cost_price into v_cost from public.quotation_items where id = v_item;
  perform pg_temp.check_that(v_cost = 100, 'owner can write cost price');

  -- add a salesperson to org A and act as them
  insert into public.memberships (org_id, user_id, role)
  values (v_org_a, '33333333-3333-3333-3333-333333333333', 'sales');

  perform pg_temp.become('33333333-3333-3333-3333-333333333333');
  update public.quotation_items set cost_price = 1, margin = 999 where id = v_item;

  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  select cost_price into v_cost from public.quotation_items where id = v_item;
  perform pg_temp.check_that(v_cost = 100, 'a salesperson cannot overwrite cost price');
end $$;

-- ------------------------------------------- import safety (no session) -----
-- A bulk import runs without a JWT. The cost guard must not treat that as an
-- unprivileged salesperson and wipe the cost price.
do $$
declare v_org uuid; v_quote uuid; v_cost numeric;
begin
  reset role;
  perform set_config('request.jwt.claims', null, true);

  select id into v_org from public.organisations where name = 'Alpha Traders';
  insert into public.quotations (org_id, date, status) values (v_org, current_date, 'pending')
  returning id into v_quote;
  insert into public.quotation_items (org_id, quotation_id, raw_product_name, cost_price, quoted_price)
  values (v_org, v_quote, 'Imported item', 250, 300);

  select cost_price into v_cost from public.quotation_items
  where quotation_id = v_quote;
  perform pg_temp.check_that(v_cost = 250, 'an import without a session keeps its cost prices');
end $$;

-- ----------------------------------------------------------------- anon -----
do $$
declare v_count integer; v_blocked boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);
  begin
    select count(*) into v_count from public.companies;
  exception when insufficient_privilege then
    v_blocked := true; v_count := 0;
  end;
  perform pg_temp.check_that(v_blocked or v_count = 0,
    'the public anon key can read nothing');
end $$;

reset role;
rollback;
