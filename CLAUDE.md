# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm run build      # production build
npm test           # Vitest — pricing and status logic
npm run lint       # ESLint; currently passes with ZERO problems — keep it there
npm run preview    # preview built output
```

Supabase (CLI is a dev dependency, so no global install):

```bash
npx supabase db push                              # apply migrations
npx supabase functions deploy extract-requirement  # deploy the AI proxy
npx supabase db reset                             # rebuild a local DB from migrations
```

## Environment

`.env` (never committed):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SENTRY_DSN=...        # optional; error reporting is off without it
```

**No secret may ever use the `VITE_` prefix unless it is safe to publish** —
Vite inlines those into the browser bundle. The OpenAI key lives as a Supabase
secret and is used only inside the edge function. CI fails the build if a
key-shaped string appears in `dist/`.

## Architecture

**Stack:** React 18 + Vite, React Router v7, Supabase (Postgres + Auth + Edge
Functions), Zustand, Chart.js.

### Multi-tenancy — read this before touching any query

Every business table has an `org_id`, defaulted from `public.current_org_id()`
and enforced by row-level security. **Never add an `org_id` filter in client
code and never let the client supply one** — the database sets it from the
caller's session. A query that "works" only because it filters in JavaScript is
a tenancy leak waiting to happen.

Adding a new table means: add `org_id` with the default, add an index, enable
RLS, add the isolation policy. Copy the pattern in `*_rls.sql`.

### Roles

`owner` / `manager` / `sales`, on `memberships`. Sales users must never see cost
price or margin: hidden in the UI via `canSeeCost(role)`, and enforced in the
database by the `guard_cost_price` trigger. If you add a surface that shows
pricing — a report, an export, a PDF — gate it on `canSeeCost` too.

### Data layer

`src/db/queries.js`, plain async functions, imported directly by pages. Two
rules:

1. **Anything that aggregates or could return many rows goes through a SQL
   function**, not a client-side loop over fetched rows. PostgREST truncates at
   1,000 rows silently, so browser-side aggregation produces wrong numbers
   rather than slow ones. See `*_reporting.sql`.
2. **Writes that touch more than one row go through an RPC** so they are one
   transaction. `save_quotation` is the model.

### Concurrency

`quotations.updated_at` is an optimistic lock. `saveQuotation()` sends the value
that was loaded; the RPC takes a `FOR UPDATE` row lock and raises `QF_CONFLICT`
if someone else saved first. The UI surfaces a reload prompt. Any new
multi-user editing surface needs the same treatment.

### Deletes and audit

Deletes are soft — `deleted_at`, excluded by the RLS policy itself, restorable
from Settings → Trash. Every change to quotations, line items, companies,
suppliers and products is written to `audit_log` by a trigger.

### Pricing

`src/domain/pricing.js` is the single implementation and is unit-tested. Margin
is cost-based: `(quoted - cost) / cost * 100`. Editing cost or quoted price
recalculates margin; editing margin recalculates quoted price. **Do not
reimplement this arithmetic in a component** — it used to exist in two places
with different behaviour on empty inputs.

Quotation status derives from its line items (`src/utils/statusUtils.js`): all
won → `won`, some won → `partial_win`, any pending → `pending`, else `lost`.

### Migrations

`supabase/migrations/`, applied in filename order. Never edit a migration that
has been applied to production — add a new one. `supabase/tests/` holds SQL
tests, including the cross-tenant isolation suite.

### Uploads

`FileUploader` sends images to the `extract-requirement` edge function with the
user's session token. The function checks membership, enforces the org's monthly
page quota, calls the vision model with a server-held key, and records usage in
`ai_usage`.

## Styling

Global CSS custom properties in `src/styles/index.css` (`--primary`, `--bg`,
`--text-muted`, …). No CSS modules. Inline `style` objects are used heavily in
pages alongside the global classes — match the surrounding file.

## Not wired up

`src/pages/Requirement*.jsx` and the `requirements` tables exist but have no
routes; the quotation wizard superseded them. Don't assume they work.
