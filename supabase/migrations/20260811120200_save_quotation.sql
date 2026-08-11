-- ============================================================================
-- Transactional quotation save.
--
-- Replaces two bad patterns:
--   1. QuotationDetail saved one line item per HTTP round trip, awaited in
--      sequence — a 40-line quote was 41 requests, and a failure halfway left
--      the quote partly saved with no way back.
--   2. updateQuotationWithItems() deleted every item and re-inserted them, so
--      line items got fresh ids on every save. Anything later attached to a
--      line (an audit record, a comment, an attachment) would be orphaned.
--
-- This does the whole save in one statement, in one transaction, and preserves
-- line item ids. It runs as the caller, so RLS still decides what they may touch.
--
-- Concurrency: two salespeople can have the same quotation open. Without a
-- check, the second person to press Save silently erases the first person's
-- work — including their prices. So the caller sends the updated_at it loaded,
-- and a mismatch is refused with QF_CONFLICT rather than overwriting. The row
-- is also locked FOR UPDATE, so two saves landing in the same millisecond are
-- serialised instead of interleaving.
-- ============================================================================

create or replace function public.save_quotation(
  p_quotation_id       uuid,        -- null to create a new quotation
  p_header             jsonb,       -- { company_id, date, status, notes }
  p_items              jsonb,       -- [ { id?, raw_product_name, quantity, ... } ]
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id         uuid;
  v_item       jsonb;
  v_item_id    uuid;
  v_keep       uuid[] := '{}';
  v_current    timestamptz;
  v_updated_at timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be an array';
  end if;

  -- ---- collision check --------------------------------------------------
  if p_quotation_id is not null then
    -- Lock the row for the rest of the transaction. A second concurrent save
    -- waits here rather than reading stale data and racing us.
    select updated_at into v_current
    from public.quotations
    where id = p_quotation_id
    for update;

    if v_current is null then
      raise exception 'Quotation not found';
    end if;

    if p_expected_updated_at is not null
       and v_current > p_expected_updated_at then
      raise exception 'QF_CONFLICT: this quotation was changed by someone else at %', v_current
        using errcode = '40001';
    end if;
  end if;

  -- ---- header ----------------------------------------------------------
  if p_quotation_id is null then
    insert into public.quotations (company_id, date, status, notes)
    values (
      nullif(p_header ->> 'company_id', '')::uuid,
      coalesce((p_header ->> 'date')::date, current_date),
      coalesce(p_header ->> 'status', 'pending'),
      nullif(p_header ->> 'notes', '')
    )
    returning id into v_id;
  else
    update public.quotations set
      company_id = nullif(p_header ->> 'company_id', '')::uuid,
      date       = coalesce((p_header ->> 'date')::date, date),
      status     = coalesce(p_header ->> 'status', status),
      notes      = nullif(p_header ->> 'notes', ''),
      updated_at = now()
    where id = p_quotation_id
    returning id into v_id;

    -- No row came back: it either doesn't exist, or RLS says it isn't ours.
    if v_id is null then
      raise exception 'Quotation not found';
    end if;
  end if;

  -- ---- items -----------------------------------------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- The client uses placeholder ids like "new_1712…" for unsaved rows;
    -- anything that isn't a real uuid is treated as an insert.
    v_item_id := case
      when (v_item ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_item ->> 'id')::uuid
      else null
    end;

    if v_item_id is not null then
      update public.quotation_items set
        raw_product_name  = coalesce(v_item ->> 'raw_product_name', ''),
        quantity          = nullif(v_item ->> 'quantity', '')::numeric,
        unit              = nullif(v_item ->> 'unit', ''),
        cost_price        = nullif(v_item ->> 'cost_price', '')::numeric,
        quoted_price      = nullif(v_item ->> 'quoted_price', '')::numeric,
        margin            = nullif(v_item ->> 'margin', '')::numeric,
        supplier_id       = nullif(v_item ->> 'supplier_id', '')::uuid,
        master_product_id = nullif(v_item ->> 'master_product_id', '')::uuid,
        item_status       = coalesce(nullif(v_item ->> 'item_status', ''), 'pending')
      where id = v_item_id and quotation_id = v_id
      returning id into v_item_id;
    end if;

    if v_item_id is null then
      insert into public.quotation_items (
        quotation_id, raw_product_name, quantity, unit,
        cost_price, quoted_price, margin, supplier_id, master_product_id, item_status
      ) values (
        v_id,
        coalesce(v_item ->> 'raw_product_name', ''),
        nullif(v_item ->> 'quantity', '')::numeric,
        nullif(v_item ->> 'unit', ''),
        nullif(v_item ->> 'cost_price', '')::numeric,
        nullif(v_item ->> 'quoted_price', '')::numeric,
        nullif(v_item ->> 'margin', '')::numeric,
        nullif(v_item ->> 'supplier_id', '')::uuid,
        nullif(v_item ->> 'master_product_id', '')::uuid,
        coalesce(nullif(v_item ->> 'item_status', ''), 'pending')
      )
      returning id into v_item_id;
    end if;

    v_keep := array_append(v_keep, v_item_id);
  end loop;

  -- Rows the user removed in the editor.
  delete from public.quotation_items
  where quotation_id = v_id
    and not (id = any (v_keep));

  -- Hand back the new watermark so the client can keep editing without a
  -- reload and still detect the next collision.
  select updated_at into v_updated_at from public.quotations where id = v_id;

  return jsonb_build_object('id', v_id, 'updated_at', v_updated_at);
end $$;

revoke all on function public.save_quotation(uuid, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.save_quotation(uuid, jsonb, jsonb, timestamptz) to authenticated;
