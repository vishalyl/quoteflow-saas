# QuoteFlow

Quotation and pricing intelligence for B2B trading companies. Photograph a
client's requirement sheet, price it against everything you've ever quoted, and
never let a deal go cold.

## Running it

```bash
npm install
cp .env.example .env    # fill in your Supabase URL and anon key
npm run dev             # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (pricing and status logic) |
| `npm run lint` | ESLint — passes with zero problems; keep it that way |

## First-run checklist

The app is multi-tenant and does not work until the database is set up.

1. **Apply the migrations**
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   This creates organisations, memberships, row-level security, the reporting
   functions, and parks any pre-existing data in one legacy organisation.

2. **Deploy the extraction function** — image upload does not work without it.
   ```bash
   npx supabase secrets set OPENAI_API_KEY=sk-...   # use a freshly rotated key
   npx supabase functions deploy extract-requirement
   ```

3. **Create your user** — Supabase Dashboard → Authentication → Users → Add user
   (tick *Auto Confirm*), or sign up in the app and click the emailed link.

4. **Attach yourself to the legacy organisation** if you have existing data:
   ```sql
   insert into memberships (org_id, user_id, role)
   select o.id, u.id, 'owner'
   from organisations o, auth.users u
   where o.slug = 'industrial-rubber-products' and u.email = 'you@example.com';
   ```
   Without this, signing in gives you a fresh empty organisation instead.

## How it fits together

**Stack** — React 18 + Vite, React Router v7, Supabase (Postgres + Auth + Edge
Functions), Zustand, Chart.js.

**Tenancy** — every business row carries an `org_id`, set by a column default
that reads the caller's membership, and enforced by row-level security. The
client never sends it and cannot spoof it. See
`supabase/migrations/*_tenancy.sql` and `*_rls.sql`.

**Roles** — `owner` (everything, including team and billing), `manager` (sees
cost prices and margins), `sales` (never sees cost or margin — enforced by a
database trigger, not just hidden in the UI).

**Data layer** — `src/db/queries.js`, plain async functions. Anything that
aggregates or pages goes through a SQL function rather than fetching rows into
the browser; see `*_reporting.sql`.

**Pricing** — one tested module, `src/domain/pricing.js`. Margin is always
cost-based: `(quoted - cost) / cost * 100`. Editing cost or quoted price
recalculates margin; editing margin recalculates the quoted price.

**Concurrency** — quotations carry `updated_at`. Saving sends the value you
loaded; if a colleague saved first, the write is refused and you're offered a
reload rather than silently overwriting their prices.

**Deletes** — soft. Rows are hidden by the RLS policy itself and restorable from
Settings → Trash.

**Audit** — every change to quotations, line items, companies, suppliers and
products is recorded in `audit_log` with who, when and which fields.

## Known gaps

- **`src/pages/Requirement*.jsx` are not routed.** The inbound-RFQ module was
  superseded by the quotation wizard. Revive it or delete it — it is currently
  dead weight.
- **Sales-role cost hiding is enforced on writes, not reads.** The trigger stops
  a salesperson changing cost or margin, and the UI hides both, but a
  determined user could still read them through the API. Closing that properly
  needs a masked view; see the blueprint.
- **No billing.** Plan and seat fields exist on `organisations`; nothing charges
  anyone yet.

`saas-blueprint/` contains the full audit and the plan for what remains.
