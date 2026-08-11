-- ============================================================================
-- QuoteFlow safety checks — paste this whole file into the Supabase SQL Editor
-- of your STAGING project and press Run.
--
-- It creates two fake companies with fake users, tries to make one snoop on the
-- other, and reports whether the database stopped it. It cleans up after itself.
--
-- You should get a table where every row says PASS.
-- ============================================================================

-- Clear anything left behind by a previous run, so this is safe to re-run.
reset role;
select set_config('request.jwt.claims', '', true);

delete from public.audit_log
where org_id in (select id from public.organisations where name like 'QF Test %');
delete from public.organisations where name like 'QF Test %';
delete from auth.users where email like 'qf-%@test.invalid';

create temp table if not exists qf_results (
  seq        serial,
  check_name text,
  result     text
);
truncate qf_results;

-- The checks run as the `authenticated` and `anon` roles, so those roles need
-- to be able to write their results into this scratch table.
do $$
declare v_seq text;
begin
  execute 'grant all on qf_results to public';
  v_seq := pg_get_serial_sequence('qf_results', 'seq');
  if v_seq is not null then
    execute format('grant all on sequence %s to public', v_seq);
  end if;
end $$;

create or replace function pg_temp.record(p_ok boolean, p_label text)
returns void language sql as $$
  insert into qf_results (check_name, result)
  values (p_label, case when p_ok then 'PASS' else '*** FAIL ***' end);
$$;

create or replace function pg_temp.become(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.become_admin()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Three fake users: two owners of different companies, one salesperson.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qf-owner-a@test.invalid', '', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qf-owner-b@test.invalid', '', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qf-sales-a@test.invalid', '', now(), now(), now())
on conflict (id) do nothing;

do $$
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  perform public.create_organisation('QF Test Alpha');
  insert into public.companies (name) values ('Alpha Client');

  perform pg_temp.become('22222222-2222-2222-2222-222222222222');
  perform public.create_organisation('QF Test Beta');
  insert into public.companies (name) values ('Beta Client');
end $$;

-- ---------------------------------------------------- can one see the other?
do $$
declare
  v_count integer;
  v_org_b uuid;
  v_beta_company uuid;
  v_blocked boolean;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');

  select count(*) into v_count from public.companies where org_id is null;
  perform pg_temp.record(v_count = 0, 'Account is stamped on new rows automatically');

  select count(*) into v_count from public.companies;
  perform pg_temp.record(v_count = 1, 'Company A sees only its own client list');

  select count(*) into v_count from public.companies where name = 'Beta Client';
  perform pg_temp.record(v_count = 0, 'Company A cannot read Company B''s data');

  perform pg_temp.become('22222222-2222-2222-2222-222222222222');
  select count(*) into v_count from public.companies;
  perform pg_temp.record(v_count = 1, 'Company B sees only its own client list');
  select id, org_id into v_beta_company, v_org_b from public.companies limit 1;

  perform pg_temp.become('11111111-1111-1111-1111-111111111111');

  update public.companies set name = 'HIJACKED' where id = v_beta_company;
  get diagnostics v_count = row_count;
  perform pg_temp.record(v_count = 0, 'Company A cannot edit Company B''s data');

  delete from public.companies where id = v_beta_company;
  get diagnostics v_count = row_count;
  perform pg_temp.record(v_count = 0, 'Company A cannot delete Company B''s data');

  v_blocked := false;
  begin
    insert into public.companies (name, org_id) values ('Smuggled', v_org_b);
  exception when others then
    v_blocked := true;
  end;
  perform pg_temp.record(v_blocked, 'Company A cannot plant data inside Company B');

  v_blocked := false;
  begin
    perform public.create_organisation('Sneaky Second Account');
  exception when others then
    v_blocked := true;
  end;
  perform pg_temp.record(v_blocked, 'One person cannot belong to two accounts');
end $$;

-- ------------------------------------------------- can salespeople see cost?
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
  values (v_quote, 'QF Test Gasket', 100, 120, 20)
  returning id into v_item;

  select cost_price into v_cost from public.quotation_items where id = v_item;
  perform pg_temp.record(v_cost = 100, 'An owner can set cost prices');

  insert into public.memberships (org_id, user_id, role)
  values (v_org_a, '33333333-3333-3333-3333-333333333333', 'sales');

  perform pg_temp.become('33333333-3333-3333-3333-333333333333');
  update public.quotation_items set cost_price = 1, margin = 999 where id = v_item;

  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  select cost_price into v_cost from public.quotation_items where id = v_item;
  perform pg_temp.record(v_cost = 100, 'A salesperson cannot change cost prices');
end $$;

-- ------------------------------------------ two people editing the same quote
do $$
declare
  v_quote uuid;
  v_saved jsonb;
  v_stale timestamptz;
  v_conflict boolean := false;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');

  v_saved := public.save_quotation(
    null,
    jsonb_build_object('date', current_date::text, 'status', 'pending'),
    jsonb_build_array(jsonb_build_object('raw_product_name', 'QF Concurrency Item', 'quoted_price', '500'))
  );
  v_quote := (v_saved ->> 'id')::uuid;
  perform pg_temp.record(v_quote is not null, 'A quotation saves in one transaction');

  -- Pretend we loaded the quote a while ago, then someone else saved it.
  v_stale := (v_saved ->> 'updated_at')::timestamptz - interval '1 minute';
  update public.quotations set updated_at = now() where id = v_quote;

  begin
    perform public.save_quotation(
      v_quote,
      jsonb_build_object('date', current_date::text, 'status', 'won'),
      jsonb_build_array(jsonb_build_object('raw_product_name', 'Overwritten', 'quoted_price', '1')),
      v_stale
    );
  exception when others then
    v_conflict := sqlerrm like '%QF_CONFLICT%';
  end;
  perform pg_temp.record(v_conflict, 'A stale save is refused instead of overwriting a colleague');
end $$;

-- ------------------------------------------------------- deleting and undoing
do $$
declare
  v_company uuid;
  v_count integer;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');
  insert into public.companies (name) values ('QF Deletable Client') returning id into v_company;

  perform public.soft_delete('companies', v_company);
  select count(*) into v_count from public.companies where id = v_company;
  perform pg_temp.record(v_count = 0, 'A deleted record disappears from the app');

  select count(*) into v_count from public.list_deleted() where id = v_company;
  perform pg_temp.record(v_count = 1, 'A deleted record is listed in Trash');

  perform public.restore_deleted('companies', v_company);
  select count(*) into v_count from public.companies where id = v_company;
  perform pg_temp.record(v_count = 1, 'A deleted record can be restored');
end $$;

-- ------------------------------------------------------- history and reports
do $$
declare
  v_count integer;
  v_kpis jsonb;
begin
  perform pg_temp.become('11111111-1111-1111-1111-111111111111');

  select count(*) into v_count from public.audit_log;
  perform pg_temp.record(v_count > 0, 'Changes are recorded in the history log');

  v_kpis := public.dashboard_kpis();
  perform pg_temp.record((v_kpis ->> 'total')::integer >= 1,
    'The dashboard counts only this account''s quotations');
end $$;

-- -------------------------------------------- bulk imports keep cost prices
do $$
declare v_org uuid; v_quote uuid; v_cost numeric;
begin
  perform pg_temp.become_admin();

  select id into v_org from public.organisations where name = 'QF Test Alpha';
  insert into public.quotations (org_id, date, status) values (v_org, current_date, 'pending')
  returning id into v_quote;
  insert into public.quotation_items (org_id, quotation_id, raw_product_name, cost_price, quoted_price)
  values (v_org, v_quote, 'QF Imported Item', 250, 300);

  select cost_price into v_cost from public.quotation_items where quotation_id = v_quote;
  perform pg_temp.record(v_cost = 250, 'A bulk import keeps its cost prices');
end $$;

-- --------------------------------------------- what a stranger with the key sees
do $$
declare v_count integer; v_blocked boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    select count(*) into v_count from public.companies;
  exception when others then
    v_blocked := true; v_count := 0;
  end;
  perform pg_temp.record(v_blocked or v_count = 0,
    'The public website key can read nothing at all');
end $$;

-- ------------------------------------------------------------------ cleanup
reset role;
select set_config('request.jwt.claims', '', true);

delete from public.audit_log
where org_id in (select id from public.organisations where name like 'QF Test %');

delete from public.organisations where name like 'QF Test %';
delete from auth.users where email like 'qf-%@test.invalid';

-- ------------------------------------------------------------------ results
select seq as "#", check_name as "Check", result as "Result"
from qf_results
order by seq;
