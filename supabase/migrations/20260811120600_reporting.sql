-- ============================================================================
-- Reporting in SQL.
--
-- The dashboard used to fetch every quotation and every line item into the
-- browser and aggregate them in JavaScript. PostgREST caps a response at 1,000
-- rows by default, so past that the dashboard did not get slow — it got
-- quietly WRONG, silently under-reporting pipeline and win rates. These
-- functions aggregate in the database and return tens of rows instead.
--
-- All are SECURITY INVOKER, so RLS still scopes every number to the caller's
-- own organisation.
-- ============================================================================

-- The headline numbers.
create or replace function public.dashboard_kpis(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with q as (
    select * from public.quotations
    where (p_from is null or date >= p_from)
      and (p_to is null or date <= p_to)
  ),
  i as (
    select qi.*, q.status, q.date
    from public.quotation_items qi
    join q on q.id = qi.quotation_id
  )
  select jsonb_build_object(
    'total',        (select count(*) from q),
    'won',          (select count(*) from q where status = 'won'),
    'lost',         (select count(*) from q where status = 'lost'),
    'pending',      (select count(*) from q where status = 'pending'),
    'partial_win',  (select count(*) from q where status = 'partial_win'),
    'win_rate',     (
      select case when count(*) filter (where status in ('won','lost','partial_win')) > 0
        then round(100.0 * count(*) filter (where status in ('won','partial_win'))
                 / count(*) filter (where status in ('won','lost','partial_win')), 2)
        else 0 end
      from q
    ),
    'avg_margin',   (select coalesce(round(avg(margin), 2), 0) from i where margin is not null),
    'won_revenue',  (select coalesce(sum(quoted_price * coalesce(quantity, 1)), 0)
                     from i where status in ('won', 'partial_win')),
    'pipeline',     (select coalesce(sum(quoted_price * coalesce(quantity, 1)), 0)
                     from i where status = 'pending')
  );
$$;

grant execute on function public.dashboard_kpis(date, date) to authenticated;

-- Win rate by month, for the trend chart.
create or replace function public.monthly_win_rate(p_months integer default 12)
returns table (month text, total bigint, won bigint, win_rate numeric, pipeline numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select to_char(date_trunc('month', q.date), 'YYYY-MM') as month,
         count(*) as total,
         count(*) filter (where q.status in ('won', 'partial_win')) as won,
         case when count(*) filter (where q.status <> 'pending') > 0
           then round(100.0 * count(*) filter (where q.status in ('won','partial_win'))
                    / count(*) filter (where q.status <> 'pending'), 2)
           else 0 end as win_rate,
         coalesce((
           select sum(qi.quoted_price * coalesce(qi.quantity, 1))
           from public.quotation_items qi
           where qi.quotation_id = any (array_agg(q.id))
         ), 0) as pipeline
  from public.quotations q
  where q.date >= date_trunc('month', now()) - make_interval(months => p_months - 1)
  group by 1
  order by 1;
$$;

grant execute on function public.monthly_win_rate(integer) to authenticated;

-- Leaderboards: who owes you the most pipeline, which suppliers earn the most.
create or replace function public.client_pipeline_ranking(p_limit integer default 20)
returns table (company_id uuid, company_name text, pipeline numeric, quotations bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.id, c.name,
         coalesce(sum(qi.quoted_price * coalesce(qi.quantity, 1)), 0) as pipeline,
         count(distinct q.id) as quotations
  from public.quotations q
  join public.companies c on c.id = q.company_id
  left join public.quotation_items qi on qi.quotation_id = q.id
  where q.status = 'pending'
  group by c.id, c.name
  order by pipeline desc
  limit p_limit;
$$;

grant execute on function public.client_pipeline_ranking(integer) to authenticated;

create or replace function public.supplier_performance_ranking(p_limit integer default 20)
returns table (supplier_id uuid, supplier_name text, won_revenue numeric, avg_margin numeric, items bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id, s.name,
         coalesce(sum(qi.quoted_price * coalesce(qi.quantity, 1))
                  filter (where q.status in ('won', 'partial_win')), 0) as won_revenue,
         round(avg(qi.margin), 2) as avg_margin,
         count(*) as items
  from public.quotation_items qi
  join public.quotations q on q.id = qi.quotation_id
  join public.suppliers s on s.id = qi.supplier_id
  group by s.id, s.name
  order by won_revenue desc
  limit p_limit;
$$;

grant execute on function public.supplier_performance_ranking(integer) to authenticated;

create or replace function public.top_products(p_limit integer default 10)
returns table (product_name text, won_revenue numeric, times_quoted bigint, avg_margin numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(mp.name, qi.raw_product_name) as product_name,
         coalesce(sum(qi.quoted_price * coalesce(qi.quantity, 1))
                  filter (where q.status in ('won', 'partial_win')), 0) as won_revenue,
         count(*) as times_quoted,
         round(avg(qi.margin), 2) as avg_margin
  from public.quotation_items qi
  join public.quotations q on q.id = qi.quotation_id
  left join public.master_products mp on mp.id = qi.master_product_id
  group by 1
  order by won_revenue desc
  limit p_limit;
$$;

grant execute on function public.top_products(integer) to authenticated;

-- The two dashboard alert lists, computed server-side.
create or replace function public.quotations_needing_attention()
returns table (
  id uuid, company_name text, date date, kind text, days_old integer, value numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with agg as (
    select q.id, q.date, c.name as company_name,
           count(qi.id) as item_count,
           count(qi.id) filter (
             where coalesce(qi.cost_price, 0) = 0 or coalesce(qi.quoted_price, 0) = 0
           ) as unpriced,
           coalesce(sum(qi.quoted_price * coalesce(qi.quantity, 1)), 0) as value
    from public.quotations q
    left join public.companies c on c.id = q.company_id
    left join public.quotation_items qi on qi.quotation_id = q.id
    where q.status = 'pending'
    group by q.id, q.date, c.name
  )
  select id, company_name, date,
         case when unpriced > 0 then 'incomplete' else 'stale' end as kind,
         (current_date - date)::integer as days_old,
         value
  from agg
  where item_count > 0
    and (unpriced > 0 or (current_date - date) >= 3)
  order by date;
$$;

grant execute on function public.quotations_needing_attention() to authenticated;

-- Win/loss split per counterparty, for the two comparison charts.
create or replace function public.company_win_loss(p_limit integer default 12)
returns table (company_id uuid, company_name text, won bigint, lost bigint, pending bigint, partial_win bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.id, c.name,
         count(*) filter (where q.status = 'won'),
         count(*) filter (where q.status = 'lost'),
         count(*) filter (where q.status = 'pending'),
         count(*) filter (where q.status = 'partial_win')
  from public.quotations q
  join public.companies c on c.id = q.company_id
  group by c.id, c.name
  order by count(*) desc
  limit p_limit;
$$;

grant execute on function public.company_win_loss(integer) to authenticated;

create or replace function public.supplier_win_loss(p_limit integer default 12)
returns table (supplier_id uuid, supplier_name text, won bigint, lost bigint, pending bigint, partial_win bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.id, s.name,
         count(distinct q.id) filter (where q.status = 'won'),
         count(distinct q.id) filter (where q.status = 'lost'),
         count(distinct q.id) filter (where q.status = 'pending'),
         count(distinct q.id) filter (where q.status = 'partial_win')
  from public.quotation_items qi
  join public.quotations q on q.id = qi.quotation_id
  join public.suppliers s on s.id = qi.supplier_id
  group by s.id, s.name
  order by count(distinct q.id) desc
  limit p_limit;
$$;

grant execute on function public.supplier_win_loss(integer) to authenticated;

-- The two spotlight panels. A null id means "across everything".
create or replace function public.supplier_spotlight(p_supplier_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with items as (
    select qi.*, q.status, q.date, q.id as qid
    from public.quotation_items qi
    join public.quotations q on q.id = qi.quotation_id
    where p_supplier_id is null or qi.supplier_id = p_supplier_id
  ),
  quotes as (select distinct qid, status from items)
  select jsonb_build_object(
    'won',       (select count(*) from quotes where status = 'won'),
    'lost',      (select count(*) from quotes where status = 'lost'),
    'partial',   (select count(*) from quotes where status = 'partial_win'),
    'win_rate',  (
      select case when count(*) filter (where status <> 'pending') > 0
        then round(100.0 * (count(*) filter (where status = 'won')
                          + 0.5 * count(*) filter (where status = 'partial_win'))
                 / count(*) filter (where status <> 'pending'), 1)
        else 0 end from quotes
    ),
    'avg_cost',   (select coalesce(round(avg(cost_price), 2), 0) from items where cost_price is not null),
    'avg_margin', (select coalesce(round(avg(margin), 2), 0) from items where margin is not null),
    'margin_by_month', coalesce((
      select jsonb_agg(row_to_json(m) order by m.month)
      from (
        select to_char(date_trunc('month', date), 'YYYY-MM') as month,
               round(avg(margin), 2) as avg_margin
        from items where margin is not null
        group by 1 order by 1 desc limit 6
      ) m
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_to_json(r))
      from (
        select raw_product_name, quantity, cost_price, quoted_price, margin, date, status
        from items order by date desc limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.supplier_spotlight(uuid) to authenticated;

create or replace function public.company_spotlight(p_company_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with quotes as (
    select q.* from public.quotations q
    where p_company_id is null or q.company_id = p_company_id
  ),
  items as (
    select qi.*, q.status, q.date
    from public.quotation_items qi
    join quotes q on q.id = qi.quotation_id
  )
  select jsonb_build_object(
    'won',      (select count(*) from quotes where status = 'won'),
    'lost',     (select count(*) from quotes where status = 'lost'),
    'partial',  (select count(*) from quotes where status = 'partial_win'),
    'pending',  (select count(*) from quotes where status = 'pending'),
    'win_rate', (
      select case when count(*) filter (where status <> 'pending') > 0
        then round(100.0 * (count(*) filter (where status = 'won')
                          + 0.5 * count(*) filter (where status = 'partial_win'))
                 / count(*) filter (where status <> 'pending'), 1)
        else 0 end from quotes
    ),
    'revenue',    (select coalesce(sum(quoted_price * coalesce(quantity, 1)), 0)
                   from items where status in ('won', 'partial_win')),
    'pipeline',   (select coalesce(sum(quoted_price * coalesce(quantity, 1)), 0)
                   from items where status = 'pending'),
    'avg_margin', (select coalesce(round(avg(margin), 2), 0) from items where margin is not null),
    'revenue_by_month', coalesce((
      select jsonb_agg(row_to_json(m) order by m.month)
      from (
        select to_char(date_trunc('month', date), 'YYYY-MM') as month,
               sum(quoted_price * coalesce(quantity, 1)) as revenue
        from items where status in ('won', 'partial_win')
        group by 1 order by 1 desc limit 6
      ) m
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row_to_json(r))
      from (
        select id, date, status,
               (select coalesce(sum(qi.quoted_price * coalesce(qi.quantity, 1)), 0)
                from public.quotation_items qi where qi.quotation_id = quotes.id) as value
        from quotes order by date desc limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.company_spotlight(uuid) to authenticated;

-- ------------------------------------------------------------ pagination ----
-- The master database view, filtered and paged in SQL rather than pulling
-- every line item ever quoted into the browser.
create or replace function public.master_database(
  p_status            text default null,
  p_company_id        uuid default null,
  p_master_product_id uuid default null,
  p_date_from         date default null,
  p_date_to           date default null,
  p_margin_min        numeric default null,
  p_margin_max        numeric default null,
  p_search            text default null,
  p_limit             integer default 100,
  p_offset            integer default 0
)
returns table (
  id uuid, quotation_id uuid, date date, company_id uuid, company_name text,
  supplier_name text, master_product_name text, raw_product_name text,
  quantity numeric, unit text, cost_price numeric, quoted_price numeric,
  margin numeric, item_status text, total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select qi.id, qi.quotation_id, q.date, q.company_id,
           c.name as company_name, s.name as supplier_name,
           mp.name as master_product_name, qi.raw_product_name,
           qi.quantity, qi.unit, qi.cost_price, qi.quoted_price,
           qi.margin, qi.item_status
    from public.quotation_items qi
    join public.quotations q on q.id = qi.quotation_id
    left join public.companies c on c.id = q.company_id
    left join public.suppliers s on s.id = qi.supplier_id
    left join public.master_products mp on mp.id = qi.master_product_id
    where (p_status is null or qi.item_status = p_status)
      and (p_company_id is null or q.company_id = p_company_id)
      and (p_master_product_id is null or qi.master_product_id = p_master_product_id)
      and (p_date_from is null or q.date >= p_date_from)
      and (p_date_to is null or q.date <= p_date_to)
      and (p_margin_min is null or qi.margin >= p_margin_min)
      and (p_margin_max is null or qi.margin <= p_margin_max)
      and (p_search is null or qi.raw_product_name ilike '%' || p_search || '%')
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by f.date desc, f.id
  -- Hard ceiling: a page is ~100 rows, and export asks for 2000. Nothing may
  -- ask for "everything" — that is the bug this function exists to fix.
  limit greatest(1, least(p_limit, 2000))
  offset greatest(0, p_offset);
$$;

grant execute on function public.master_database(
  text, uuid, uuid, date, date, numeric, numeric, text, integer, integer
) to authenticated;
