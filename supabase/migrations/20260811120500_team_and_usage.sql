-- ============================================================================
-- Team membership and AI metering.
--
-- Everything needed for an organisation to have more than one person in it:
-- invitations, roles, seat limits — and a record of AI spend per organisation,
-- which is both a cost control and the usage signal billing will need.
-- ============================================================================

alter table public.organisations
  add column if not exists ai_pages_per_period integer not null default 200,
  add column if not exists period_started_at timestamptz not null default date_trunc('month', now());

-- ------------------------------------------------------------ invitations ---
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       text not null check (position('@' in email) > 1),
  role        public.app_role not null default 'sales',
  token       uuid not null default gen_random_uuid(),
  invited_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create unique index if not exists invitations_pending_key
  on public.invitations (org_id, lower(email))
  where accepted_at is null;

create index if not exists invitations_email_idx on public.invitations (lower(email))
  where accepted_at is null;

alter table public.invitations enable row level security;

drop policy if exists invitations_manage on public.invitations;
create policy invitations_manage on public.invitations
  for all to authenticated
  using (org_id = public.current_org_id() and public.current_app_role() = 'owner')
  with check (org_id = public.current_org_id() and public.current_app_role() = 'owner');

revoke all on public.invitations from anon;

-- ------------------------------------------------------------- ai usage -----
create table if not exists public.ai_usage (
  id                bigint generated always as identity primary key,
  org_id            uuid not null references public.organisations(id) on delete cascade,
  user_id           uuid references auth.users(id),
  pages             integer not null default 1,
  prompt_tokens     integer,
  completion_tokens integer,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_org_time_idx on public.ai_usage (org_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (org_id = public.current_org_id());

revoke all on public.ai_usage from anon;

-- ------------------------------------------------------------- members ------
create or replace function public.list_members()
returns table (user_id uuid, email text, full_name text, role public.app_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.user_id,
         u.email::text,
         (u.raw_user_meta_data ->> 'full_name')::text,
         m.role,
         m.accepted_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = public.current_org_id()
  order by m.accepted_at;
$$;

grant execute on function public.list_members() to authenticated;

create or replace function public.invite_member(p_email text, p_role public.app_role default 'sales')
returns public.invitations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := public.current_org_id();
  v_seats  integer;
  v_in_use integer;
  v_invite public.invitations;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Only the owner can invite people';
  end if;

  select seats_purchased into v_seats from public.organisations where id = v_org;

  select (select count(*) from public.memberships where org_id = v_org)
       + (select count(*) from public.invitations
          where org_id = v_org and accepted_at is null and expires_at > now())
    into v_in_use;

  if v_in_use >= v_seats then
    raise exception 'All % seats are in use. Add seats before inviting anyone else.', v_seats;
  end if;

  if exists (
    select 1 from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = v_org and lower(u.email) = lower(trim(p_email))
  ) then
    raise exception '% is already in your team', p_email;
  end if;

  insert into public.invitations (org_id, email, role, invited_by)
  values (v_org, lower(trim(p_email)), p_role, auth.uid())
  on conflict (org_id, lower(email)) where accepted_at is null
  do update set role = excluded.role,
                expires_at = now() + interval '14 days',
                created_at = now()
  returning * into v_invite;

  return v_invite;
end $$;

grant execute on function public.invite_member(text, public.app_role) to authenticated;

-- Called after sign-in for a user who has no organisation yet: if someone
-- invited this email address, join that organisation.
create or replace function public.claim_invitation()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text;
  v_invite public.invitations;
begin
  if auth.uid() is null then return null; end if;
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    return public.current_org_id();
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return null; end if;

  select * into v_invite
  from public.invitations
  where lower(email) = lower(v_email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if v_invite.id is null then return null; end if;

  insert into public.memberships (org_id, user_id, role, invited_by, invited_at)
  values (v_invite.org_id, auth.uid(), v_invite.role, v_invite.invited_by, v_invite.created_at);

  update public.invitations set accepted_at = now() where id = v_invite.id;

  return v_invite.org_id;
end $$;

grant execute on function public.claim_invitation() to authenticated;

create or replace function public.set_member_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid := public.current_org_id();
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Only the owner can change roles';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;

  update public.memberships set role = p_role
  where org_id = v_org and user_id = p_user_id;

  if not found then raise exception 'That person is not in your team'; end if;
end $$;

grant execute on function public.set_member_role(uuid, public.app_role) to authenticated;

create or replace function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid := public.current_org_id();
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Only the owner can remove people';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself. Transfer ownership first.';
  end if;

  delete from public.memberships where org_id = v_org and user_id = p_user_id;
  if not found then raise exception 'That person is not in your team'; end if;
end $$;

grant execute on function public.remove_member(uuid) to authenticated;

-- --------------------------------------------------------------- quota ------
-- Called by the extract-requirement edge function before spending money.
create or replace function public.check_ai_quota(p_pages integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := public.current_org_id();
  v_limit integer;
  v_start timestamptz;
  v_used  integer;
begin
  if v_org is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_organisation');
  end if;

  select ai_pages_per_period, period_started_at into v_limit, v_start
  from public.organisations where id = v_org;

  select coalesce(sum(pages), 0) into v_used
  from public.ai_usage
  where org_id = v_org and created_at >= greatest(v_start, date_trunc('month', now()));

  return jsonb_build_object(
    'allowed', (v_used + p_pages) <= v_limit,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0)
  );
end $$;

grant execute on function public.check_ai_quota(integer) to authenticated;

create or replace function public.record_ai_usage(
  p_pages integer,
  p_prompt_tokens integer default null,
  p_completion_tokens integer default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_org uuid := public.current_org_id();
begin
  if v_org is null then return; end if;
  insert into public.ai_usage (org_id, user_id, pages, prompt_tokens, completion_tokens)
  values (v_org, auth.uid(), p_pages, p_prompt_tokens, p_completion_tokens);
end $$;

grant execute on function public.record_ai_usage(integer, integer, integer) to authenticated;
