-- ============================================================================
-- Row Level Security.
--
-- Until now the anon key — which is public by design, since it ships in the JS
-- bundle — could read, edit and delete every row in the database. Anyone who
-- opened the app could pull every customer's cost prices out of the browser
-- console. These policies close that: `anon` gets nothing, and a signed-in user
-- can only touch rows belonging to their own organisation.
-- ============================================================================

-- ------------------------------------------------------ organisations -------
alter table public.organisations enable row level security;

drop policy if exists organisations_select on public.organisations;
create policy organisations_select on public.organisations
  for select to authenticated
  using (id = public.current_org_id());

-- Only the owner edits org settings (name, GSTIN, letterhead, plan).
drop policy if exists organisations_update on public.organisations;
create policy organisations_update on public.organisations
  for update to authenticated
  using (id = public.current_org_id() and public.current_app_role() = 'owner')
  with check (id = public.current_org_id());

-- Creation goes exclusively through public.create_organisation(), which is
-- SECURITY DEFINER — so there is deliberately no INSERT policy here.

-- -------------------------------------------------------- memberships -------
alter table public.memberships enable row level security;

drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists memberships_manage on public.memberships;
create policy memberships_manage on public.memberships
  for all to authenticated
  using (org_id = public.current_org_id() and public.current_app_role() = 'owner')
  with check (org_id = public.current_org_id() and public.current_app_role() = 'owner');

-- --------------------------------------------------- business tables --------
-- One policy per table covering select/insert/update/delete. USING filters what
-- you can see and change; WITH CHECK stops you writing a row into someone
-- else's organisation.
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

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (org_id = public.current_org_id())
        with check (org_id = public.current_org_id())
    $f$, t || '_org_isolation', t);
  end loop;
end $$;

-- ------------------------------------------------------------ anon ----------
-- Belt and braces: with RLS on and no policy granting `anon` anything, the
-- public key already gets nothing. Revoking table privileges makes that
-- explicit and survives someone later adding a careless `to public` policy.
do $$
declare
  t text;
  all_tables text[] := array[
    'organisations', 'memberships',
    'companies', 'suppliers', 'master_products', 'product_mappings',
    'quotations', 'quotation_items', 'requirements', 'requirement_items'
  ];
begin
  foreach t in array all_tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
