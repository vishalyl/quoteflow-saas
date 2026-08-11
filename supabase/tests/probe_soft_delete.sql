-- ============================================================================
-- Diagnostic: why is the soft delete update refused?
-- Paste into the STAGING SQL Editor and run. It prints a small table.
-- Cleans up after itself.
-- ============================================================================

reset role;
select set_config('request.jwt.claims', '', true);

delete from public.audit_log
where org_id in (select id from public.organisations where name = 'QF Probe');
delete from public.organisations where name = 'QF Probe';
delete from auth.users where email = 'qf-probe@test.invalid';

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'qf-probe@test.invalid', '', now(), now(), now());

create temp table if not exists qf_probe (seq serial, step text, value text);
truncate qf_probe;
do $$
declare v_seq text;
begin
  execute 'grant all on qf_probe to public';
  v_seq := pg_get_serial_sequence('qf_probe', 'seq');
  if v_seq is not null then execute format('grant all on sequence %s to public', v_seq); end if;
end $$;

-- Mimics soft_delete's shape exactly: security invoker + a SET clause, so we
-- can see whether the identity survives into that context.
create or replace function public.probe_org_inside()
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  return public.current_org_id();
end $$;
grant execute on function public.probe_org_inside() to authenticated;

do $$
declare
  v_a uuid; v_b uuid; v_org uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

  perform public.create_organisation('QF Probe');

  -- Who does the database think we are, right now?
  insert into qf_probe (step, value) values
    ('1. auth.uid()',        coalesce(auth.uid()::text, 'NULL')),
    ('2. current_org_id()',  coalesce(public.current_org_id()::text, 'NULL')),
    ('3. current_user',      current_user);

  insert into public.companies (name) values ('Probe Client A')
  returning id, org_id into v_a, v_org;
  insert into qf_probe (step, value) values
    ('4. inserted company org_id', coalesce(v_org::text, 'NULL')),
    ('5. org matches current?',    case when v_org = public.current_org_id() then 'YES' else 'NO' end);

  -- (a) plain UPDATE, no function wrapper
  begin
    update public.companies set deleted_at = now() where id = v_a;
    insert into qf_probe (step, value) values ('6. plain UPDATE deleted_at', 'OK');
  exception when others then
    insert into qf_probe (step, value) values ('6. plain UPDATE deleted_at', 'FAILED — ' || sqlerrm);
  end;

  -- (b) through the soft_delete() function
  insert into public.companies (name) values ('Probe Client B') returning id into v_b;
  begin
    perform public.soft_delete('companies', v_b);
    insert into qf_probe (step, value) values ('7. soft_delete() function', 'OK');
  exception when others then
    insert into qf_probe (step, value) values ('7. soft_delete() function', 'FAILED — ' || sqlerrm);
  end;

  -- (c) does current_org_id() survive inside a SET search_path function?
  insert into qf_probe (step, value) values
    ('8. org_id seen inside soft_delete', coalesce(public.probe_org_inside()::text, 'NULL'));
exception when others then
  insert into qf_probe (step, value) values ('!! probe aborted', sqlerrm);
end $$;

reset role;
select set_config('request.jwt.claims', '', true);

delete from public.audit_log
where org_id in (select id from public.organisations where name = 'QF Probe');
delete from public.organisations where name = 'QF Probe';
delete from auth.users where email = 'qf-probe@test.invalid';
drop function if exists public.probe_org_inside();

select seq as "#", step as "Step", value as "Value" from qf_probe order by seq;
