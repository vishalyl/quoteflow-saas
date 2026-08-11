# QuoteFlow → SaaS: Conversion Blueprint

**Prepared:** 11 Aug 2026 · **Codebase:** 7,173 LOC / 43 files · **Status today:** single-tenant internal tool
**Reads the code as of commit `5ab9e59` on `master`. No application code was modified to produce this.**

A full audit of what exists today, everything that has to change before other companies can pay for it, and how to sell it in a market where Tally is the incumbent everyone already trusts.

---

## Contents

| § | Section |
|---|---------|
| 00 | [The verdict](#00--the-verdict) |
| 01 | [What you have today](#01--what-you-have-today-feature-by-feature) |
| 02 | [Code & architecture audit](#02--whats-broken-ranked-by-whether-it-stops-you-selling) |
| 03 | [The SaaS you don't have yet](#03--the-saas-around-the-product-which-doesnt-exist-yet) |
| 04 | [Target architecture](#04--target-architecture) |
| 05 | [Rebuild roadmap](#05--rebuild-roadmap) |
| 06 | [Features: add, defer, refuse](#06--what-to-add-what-to-defer-what-to-refuse) |
| 07 | [Versus Tally](#07--quoteflow-versus-tally) |
| 08 | [The rest of the field](#08--everyone-else-youll-be-compared-to) |
| 09 | [Pricing & packaging](#09--pricing-and-packaging) |
| 10 | [How to market it](#10--how-to-market-this-software) |
| 11 | [Metrics & unit economics](#11--the-numbers-that-tell-you-if-its-working) |
| 12 | [Decisions you owe](#12--decisions-only-you-can-make) |

---

## 00 — The verdict

### You have a strong product idea inside a prototype that cannot be sold as-is

QuoteFlow's core insight is genuinely good and genuinely underserved: **quotation-level pricing intelligence for Indian B2B traders**. The product logic is real, the workflow matches how these businesses actually operate, and the OCR-to-quote flow is a legitimate demo hook.

But what you built is a single-company internal tool with no tenancy, no real authentication, and secrets shipped to the browser. **Roughly 70% of the work between here and a sellable SaaS is not features — it is foundations.**

| | |
|---|---|
| **4** | **P0 blockers** — any one of them makes charging money negligent |
| **0** | **Tenancy** — no org concept anywhere in the schema or the code |
| **0** | **Tests** — and no CI, no migrations, no staging environment |
| **~14** | **Weeks to v1** — solo, focused, reusing the UI you already have |

**The single most important strategic call in this document:** do not position QuoteFlow against Tally. Tally owns the accounting ledger and will keep owning it. Position QuoteFlow *upstream* of Tally — the pre-sale layer where quotes get priced, sent, chased and won — and make "exports cleanly into Tally" a feature, not a fight. Section 07 covers this in detail.

---

## 01 — What you have today, feature by feature

Read from the code rather than the docs — the markdown files in the repo describe several things that are no longer true (the seed-on-mount behaviour described in `CLAUDE.md` no longer exists in `App.jsx`, for instance).

### Shipped and working

| Capability | Where | What it actually does | Quality |
|---|---|---|---|
| **AI requirement capture** | `FileUploader.jsx` | Up to 10 images → base64 → GPT-4o-mini vision call with a terse JSON schema → editable rows. Tesseract.js is still a dependency but the OpenAI path replaced it. | ✅ **Strong** — the demo hook |
| **4-step quote wizard** | `QuotationUpload.jsx` | Upload → company/date → item table with mapping → preview. Draft held in a Zustand store; save-to-master at any point. | ✅ Good |
| **Line-item pricing engine** | `QuotationDetail.jsx`, `EditableTable.jsx` | Cost-based margin, bidirectional: edit cost or quoted → margin recalculates; edit margin → quoted recalculates. Margin locked until cost exists. | ✅ Good — but logic duplicated in 2 files |
| **Product mapping** | `ProductMappingModal.jsx`, `Products.jsx` | Free-text product names → canonical master products, so "O-Ring 25" and "Gasket 25mm Ring" aggregate into one history. | ⭐ **Differentiator** |
| **Price history intelligence** | `PriceHistoryModal.jsx`, `queries.js` | Per product: every past quote split into *this client* vs *other clients*, with cost, margin, qty, win/loss. | ⭐ **Differentiator** |
| **Item-level win/loss** | `statusUtils.js` | Each line is won/lost/pending; the header status derives — all won → won, some won → `partial_win`, else pending/lost. More honest than header-only CRMs. | ⭐ **Differentiator** |
| **Analytics dashboard** | `Dashboard.jsx`, `Charts.jsx` | Pipeline value, top prospect, top supplier, incomplete-data alert, 3-day follow-up alert, monthly win-rate trend, company/supplier spotlights, top products. Drill-down modal on every KPI. | ⚠️ Good UX, unscalable queries |
| **Master database** | `MasterDatabase.jsx` | Every line item ever, filterable by status/company/product/date/margin, editable in place, CSV export. | ✅ Good |
| **Client-ready output** | `ClientViewModal.jsx` | Clean printable/downloadable quote view via `html-to-image` — WhatsApp-ready JPEG. | ⚠️ Works, but it is not a real document |
| **CRM-lite records** | `Companies`, `Suppliers`, detail pages | Name, contact, notes, plus per-entity deal history and analytics. | ➖ Thin |

### Built but disconnected

These exist in the repo and are **not reachable in the running app**. Decide explicitly: revive or delete.

- **The entire Requirements module** — `Requirements.jsx`, `RequirementDetail.jsx`, `RequirementUpload.jsx`, plus the `requirements` / `requirement_items` tables and six query functions. No routes in `App.jsx`, no sidebar entry. This was the inbound-RFQ half of the product; the quotation half absorbed it.
- **`HistoricalPanel.jsx`** — imports `getHistoricalData`, which **does not exist** in `queries.js` (the real function is `getMasterProductHistory`). It only survives because its one consumer, `RequirementDetail`, is unrouted. It would throw the moment you re-enable that page.
- **`DataTable.jsx`, `testParser.js`** — never imported.
- **`redistributeSuppliers()`** — a demo-data function that assigns a **random supplier to every quotation item in the database**. It is imported into two production pages (`MasterDatabase`, `Suppliers`). Delete it before anyone else's data is in that table.

### The data model

Eight tables, inferred from queries: `companies`, `suppliers`, `master_products`, `product_mappings`, `quotations`, `quotation_items`, `requirements`, `requirement_items`.

It is a reasonable shape for the domain. What's missing is everything a multi-company product needs — no `organisations`, no `users`, no `org_id` on any row, no audit columns, no soft deletes, no currency, no tax, no versioning. Section 04 gives the target schema.

---

## 02 — What's broken, ranked by whether it stops you selling

**P0 means: charging money for this, in this state, exposes you and your customers to real harm. Fix all four before a single external user touches it.**

### P0 blockers

#### P0-1 · Authentication is decorative
`src/pages/Login.jsx` · `src/stores/authStore.js` · `credentials.json`

Login compares a typed username and password against `credentials.json` — a file that is **bundled into the JavaScript shipped to every browser** and **committed to git** (it is not in `.gitignore`). Three plaintext user/password pairs are in your repo history right now.

Worse, the auth state is a boolean in a Zustand `persist` store. Anyone can open devtools and run:

```js
localStorage.setItem('auth-storage', '{"state":{"isAuthenticated":true},"version":0}')
```

…to be "logged in". There is no session, no token, no server-side check.

**Fix:** Supabase Auth (email + password, magic link, or Google OAuth). Delete `credentials.json`, purge it from git history, rotate those passwords anywhere they were reused.

#### P0-2 · The database is wide open to the internet
`src/lib/supabase.js` · every function in `src/db/queries.js`

The client talks to Supabase directly with the anon key. That is normal **only** when Row Level Security is enabled and every table has policies. There is no RLS anywhere in this repo — no policies, no `auth.uid()`, no migrations that would create them.

Since the anon key is public by design (it is in the JS bundle), **anyone who opens the site can read, edit, or delete every quotation, every cost price, and every margin in the database using nothing but the browser console.** For a pricing-intelligence product this is the worst possible leak: cost prices and margins are the most commercially sensitive numbers a trading company owns.

**Fix:** RLS on every table, keyed to organisation membership, before anything else. Verify by *attempting* a cross-org read with a real token — not by reading the policy and assuming.

#### P0-3 · Your OpenAI key is in the browser bundle
`src/components/Upload/FileUploader.jsx:28`

`VITE_OPENAI_API_KEY` — the `VITE_` prefix means Vite inlines it into the production JavaScript. Anyone who loads the app can extract it and spend your OpenAI balance until you notice. There is no rate limit, no per-tenant quota, no usage accounting.

**Fix:** move the vision call into a Supabase Edge Function (or any server route). The browser uploads the image, the server holds the key, checks the caller's org, enforces a monthly page quota, and logs the token spend against that org. This is also what makes AI usage billable later.

#### P0-4 · No multi-tenancy of any kind
Whole codebase

There is no organisation, workspace, or account concept — not in the schema, not in queries, not in the UI. Every query is "select everything". Onboarding a second customer today means either deploying a second copy of the entire stack per customer, or putting two customers' cost prices in the same tables with nothing separating them.

This is the single largest piece of work in the conversion, and it touches all 351 lines of `queries.js`, all 8 tables, and the seed/import paths.

### P1 — will hurt within the first ten customers

| Issue | Where | Consequence |
|---|---|---|
| **Dashboard loads the entire database** | `getDashboardData()` | Two unfiltered `select`s pull every quotation and every line item into the browser, then aggregate in JS. Supabase caps at 1,000 rows by default, so the dashboard silently goes **wrong** — not slow — past that. Same pattern in `getMasterDatabase()`. |
| **Saving is a serial write loop** | `QuotationDetail.handleSave` | One round trip per line item, awaited in sequence. A 40-line quote is 41 requests, and a failure halfway leaves the quote partially saved with no rollback. Needs a single transactional RPC. |
| **Destructive edit strategy** | `updateQuotationWithItems()` | Deletes all items then re-inserts them. New row IDs each time, so any future audit trail, comment, or attachment on a line item is orphaned on every save. |
| **No migrations** | `SUPABASE_MIGRATION.sql` + a README telling you to paste it into the dashboard | Schema lives in someone's memory and in the Supabase UI. With customers you need versioned, replayable migrations and a staging DB that matches production. |
| **No tests, no CI, no staging** | — | Every deploy is a hand-verified gamble. The pricing maths alone (margin/quoted round-tripping, partial-win derivation) needs unit tests, because a rounding bug here is money. |
| **No error reporting** | ~24 `console.error` calls | Every failure is swallowed into a console the customer will never open. You will hear about bugs only as churn. |
| **Hardcoded to one customer** | `index.html`, `Sidebar.jsx`, page subtitles | "Industrial Rubber Products" and the "IRP" logo mark are baked into the shell and the browser title. |
| **Demo-data code shipped to production** | `seedData.js` imported by two pages | `redistributeSuppliers()` randomises supplier assignment across every item in the database. One accidental call on a live tenant is unrecoverable. |
| **Deletes are hard deletes** | `deleteQuotation`, `deleteCompany`, … | One confirm dialog stands between a user and permanently destroying a quotation. No soft delete, no undo, no trash, no per-tenant backup story. |
| **No audit trail** | Schema | Nothing records who changed a price and when. In a multi-user product where margins are the asset, "who dropped this quote by 8%?" gets asked in month two. |
| **₹-only, tax-free, single-unit** | Everywhere | Currency symbol and `en-IN` formatting hardcoded across ~15 files. No GST fields, no HSN codes, no discounts, no freight, no terms. Indian buyers ask for all of these on day one. |
| **Duplicate-name workarounds** | 4+ files dedupe companies/products by lowercased name in the UI | A symptom of missing DB constraints. Fix with unique indexes per org, not client-side `Set` filtering. |

### P2 — quality debt, fix opportunistically

- **No type safety.** Plain JS with heavy runtime string↔number coercion *around money*. TypeScript on the data layer and pricing utilities would pay for itself.
- **Styling is split three ways** — a global CSS file, large inline style objects, and per-file style constants. You need tokens/primitives before the surface area doubles.
- **`Charts.jsx` is 988 lines** — the largest file in the project, mixing aggregation logic with rendering. Aggregations belong in SQL views anyway (see P1).
- **Accessibility** — clickable `div`s, no focus management in modals, no keyboard escape, emoji as the only icon system.
- **Mobile** — fixed sidebar, 860px-min tables. Your buyer's salespeople live on phones and WhatsApp; today the app is desktop-only.
- **React 18 / Vite 4** — a version behind on both. Cheap now, annoying later.

---

## 03 — The SaaS around the product, which doesn't exist yet

The mistake most people make converting an internal tool is thinking the work is features. It isn't. A SaaS is roughly a dozen systems that have nothing to do with quotations, and every one of them is currently at zero.

| System | Today | Minimum for v1 | Later |
|---|---|---|---|
| **Tenancy** | None | `organisations` + `org_id` on every table + RLS + JWT org claim | Sub-orgs for multi-branch; per-branch data scoping |
| **Identity** | JSON file | Supabase Auth, email verification, password reset, session expiry | Google SSO, SAML for enterprise, 2FA |
| **Roles** | None | Owner / Manager / Sales. Critically: **cost price and margin visible only to Owner+Manager** | Custom roles, field-level permissions, territory scoping |
| **Invites & team** | None | Email invite with token, seat counting, remove user, transfer ownership | Bulk invite, domain auto-join |
| **Billing** | None | Razorpay subscriptions (UPI/netbanking/cards — Stripe is awkward for Indian domestic B2B), plan table, seat/quota entitlements, GST invoice with your GSTIN, dunning on failed payment | Annual prepay, usage-based AI credits, partner/reseller billing |
| **Onboarding** | None | Self-serve signup, org creation, **bulk import of companies/suppliers/products from Excel**, sample-data toggle, 5-step checklist | Guided tours, in-app help, migration service for paid tiers |
| **Admin backoffice** | None | A page only you can see: list orgs, usage, plan, last activity; impersonate-with-consent for support | Health scores, churn-risk flags |
| **Observability** | `console.error` | Sentry (frontend + edge functions), uptime monitor, structured logs, PostHog for funnels | Per-tenant performance dashboards, error-rate SLO alerting |
| **Transactional email** | None | Resend/Postmark: verification, invite, password reset, follow-up digest, payment receipt. SPF/DKIM/DMARC on your domain. | Send quotes to clients from the app with open tracking |
| **Data lifecycle** | None | Automated backups + a *tested* restore, full data export per org, hard-delete on request within 30 days | PITR, per-tenant restore, retention policies |
| **Legal** | None | Terms, Privacy Policy, DPA, refund policy, India DPDP Act 2023 basics (purpose limitation, breach notification, grievance officer contact) | ISO 27001 / SOC 2 when enterprise deals demand it |
| **Support** | WhatsApp to you | Shared inbox, in-app widget, documented SLA per tier, a help centre with ~20 articles | Chat, phone for Enterprise, regional-language support |
| **Marketing site** | None | Landing page, pricing page, demo video, book-a-demo form, one case study (your friend's company — get the numbers before the relationship cools) | Blog/SEO engine, comparison pages, ROI calculator |

> **The role split is the one product decision hiding in this table.**
> In an Indian trading company the owner does not want the junior salesperson seeing supplier cost prices — that knowledge is what stops staff from leaving and starting a competing firm. Getting cost-price visibility right, per role, is not a nice-to-have; it is frequently the deciding factor in whether the owner buys. **Build it into the RLS policies, not just the UI.**

---

## 04 — Target architecture

Keep the stack. React + Vite + Supabase is a perfectly good foundation for this, and rewriting into Next.js buys you SEO for the marketing site (which can be a separate static site anyway) at the cost of months. The changes are structural, not technological.

### 4.1 The tenancy model

Add two tables and one column everywhere.

```sql
organisations
  id, name, slug, gstin, address, logo_url, currency,
  plan, plan_status, trial_ends_at, seats_purchased,
  ai_pages_used_this_period, created_at

memberships
  id, org_id, user_id, role ('owner'|'manager'|'sales'),
  invited_by, invited_at, accepted_at

-- then, on every existing table:
ALTER TABLE quotations ADD COLUMN org_id uuid NOT NULL
  REFERENCES organisations(id) ON DELETE CASCADE;
CREATE INDEX ON quotations (org_id, date DESC);
```

Every RLS policy then reduces to one predicate: the row's `org_id` must be in the caller's memberships. Put the user's active org in a JWT custom claim so the check is a claim comparison rather than a subquery on every row.

```sql
CREATE POLICY org_isolation ON quotations
  FOR ALL TO authenticated
  USING      (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);

-- cost visibility: a separate policy on the sensitive columns,
-- or a sales-facing view that simply omits cost_price and margin.
```

**Do not rely on the frontend passing `org_id` in filters.** Set it server-side from the token, via a column default or a trigger. Any tenancy that depends on the client remembering to add a `.eq('org_id', …)` will leak the first time someone writes a query in a hurry.

### 4.2 Push aggregation into the database

Replace `getDashboardData()` with SQL. A handful of views or RPCs — `dashboard_kpis(org_id, from, to)`, `monthly_win_rate(org_id)`, `product_price_history(org_id, master_product_id, company_id)` — return a few dozen rows each instead of the whole database. Paginate the master database and quotation list with keyset pagination.

This one change removes the silent 1,000-row correctness bug and makes the dashboard load in tens of milliseconds at any tenant size.

### 4.3 Move all secrets and AI behind Edge Functions

- `POST /extract-requirement` — accepts an uploaded image reference, verifies membership, checks the org's remaining AI page quota, calls the vision model, records `ai_usage` (tokens, cost, org, user), returns rows. The key never leaves the server.
- `POST /save-quotation` — one transactional write for header + items, so a 40-line quote is one request and either fully saves or doesn't.
- `POST /razorpay-webhook` — subscription lifecycle → `plan_status`.
- Store uploaded requirement images in Supabase Storage under an org-scoped path with its own RLS. Right now those images exist only in memory; customers will want the original sheet next to the quote.

### 4.4 Restructure the frontend

- **Kill the raw `queries.js` pattern at the page level.** Wrap it in TanStack Query for caching, retries, loading/error states and cache invalidation — that alone removes a large class of "stale after save" bugs.
- **Extract the pricing engine** into one tested module (`src/domain/pricing.ts`). It is currently implemented twice, in `QuotationDetail` and `EditableTable`, with subtly different behaviour on empty inputs.
- **Route guards** — real ones, based on session and role, not a boolean in localStorage.
- **Tenant branding** — org name, logo and quote template pulled from the `organisations` row, so the shell and the client-facing document reflect the customer, not IRP.

### 4.5 Engineering hygiene

- Supabase CLI migrations in the repo; a `staging` project mirroring production; seed data only in local/staging.
- GitHub Actions: lint, typecheck, unit tests (Vitest) on pricing/status logic, a Playwright smoke test for signup → create quote → save.
- Sentry with release tagging; PostHog for activation funnels.
- A written incident + restore drill. Practise restoring one tenant's data from backup *before* you need to.

---

## 05 — Rebuild roadmap

Estimates assume one experienced full-time developer reusing the existing UI. Halve them with two people splitting backend and product surface; double them if this is evenings and weekends.

### Phase 0 · Stop the bleeding — *1 week, before you show anyone*

- Delete `credentials.json`, purge from git history, rotate anything reused.
- Rotate the OpenAI key (assume it is compromised) and put a hard spend cap on the account **today**.
- Delete `seedData.js` and its imports; delete `DataTable.jsx`, `testParser.js`; decide on the Requirements module.
- Enable RLS on all tables with a deny-all default, so the current database stops being world-writable while you rebuild.
- Set up the repo properly: migrations, staging project, CI running lint.

### Phase 1 · Multi-tenant foundation — *4–5 weeks, the unglamorous core*

- Supabase Auth; signup/login/reset/verify; session-based route guards.
- `organisations` + `memberships`; `org_id` backfill migration; RLS policies on all eight tables; **a cross-tenant isolation test suite**.
- Roles and the cost-price visibility rule, enforced in the database.
- Team invites by email; seat counting.
- Edge functions: AI extraction proxy with quota, transactional quote save.
- Dashboard and master-database queries moved to SQL with pagination.
- Strip IRP branding; org-level branding from the DB.
- Sentry, uptime monitoring, backups verified by an actual restore.

### Phase 2 · Sellable product — *4 weeks, what buyers ask for in demo #1*

- **Proper quotation PDF** — letterhead, terms, validity, GST/HSN, signature block, quote number series. The JPEG screenshot is a demo trick; a PDF on the customer's letterhead is a purchase reason.
- **Excel/CSV import wizard** for companies, suppliers, products, and historical quotes. Without this, a new customer's account is empty and the pricing intelligence — your whole differentiator — has nothing to show for months. **This is the highest-leverage feature in the entire plan.**
- GST, discounts, freight, payment terms, quote validity, revision numbers (v1/v2 of the same quote).
- Email the quote to the client from the app; log when it was sent.
- Razorpay subscriptions, plan gating, GST invoices, dunning.
- Self-serve signup with a 14-day trial and sample data.
- Marketing site, pricing page, demo video, help centre.

### Phase 3 · The moat — *6+ weeks, after the first ten paying customers*

- **Price recommendation** — replace the history table with a suggestion: *"quote ₹512–₹528; at ₹520 you have won 7 of 9 with this client; below ₹495 you're under your own average margin."* This is the leap from **reporting** to **intelligence**, and it is what justifies the name.
- **WhatsApp integration** — send the quote via WhatsApp Business API, and ideally accept requirement images inbound. Your users already live there; this removes the app-opening problem entirely.
- **Tally export/connector** (section 07).
- Mobile-first quoting view for salespeople in the field.
- Approval workflow: quotes below X% margin need the owner's sign-off.
- Anonymised benchmark data across tenants — **only** with explicit opt-in, and only ever aggregated. Handled badly this is a lawsuit; handled well it is a genuinely unique asset.

> **Total to a defensible v1: roughly 14 weeks of focused work, of which ~5 are pure infrastructure with nothing visible to show for it. Budget for that psychologically — it is the phase where most conversions stall.**

---

## 06 — What to add, what to defer, what to refuse

### Table stakes — you will lose deals without these

| Feature | Why it's non-negotiable | Phase |
|---|---|---|
| Branded PDF quotation | The quote is the deliverable. A JPEG is not a business document. | 2 |
| Historical data import | Your differentiator is history. An empty account has none. Determines time-to-value. | 2 |
| GST / HSN / tax lines | Every Indian B2B quote carries them. Absence reads as "toy". | 2 |
| Quote numbering & revisions | Buyers reference "Quote #QT-2026-0412 rev 2". You currently have UUIDs. | 2 |
| Role-based cost visibility | The owner's #1 objection. Also your #1 upsell to Manager tier. | 1 |
| Mobile-usable quoting | Salespeople quote from the client's factory floor, on a phone. | 3 |
| Audit log | "Who changed this price?" — multi-user products get asked this in month two. | 2 |
| Email quote to client + sent status | Closes the loop between "quoted" and "followed up", which is your alert system's whole premise. | 2 |

### Differentiators — where to actually spend invention

- **Prescriptive pricing.** Today you show a table and make the salesperson interpret it. Show a recommended band, a win-probability estimate at the entered price, and a warning when they're quoting below their own historical winning price. That's a defensible product, not a report.
- **Supplier cost intelligence.** You already store cost per item per supplier. That is a supplier price index nobody else has: *"Metal Hub has raised your cost on this SKU 11% in six months; Steel World is 6% cheaper on the same item."* Purchase-side value on top of sales-side value, from data you already collect.
- **Requirement-sheet ingestion as a channel, not a feature.** The OCR is the demo hook. Make it a WhatsApp number the salesperson forwards the client's image to, which replies with a draft quote link. That is a story people retell.
- **Quote-to-order conversion memory.** You track item-level win/loss, which most CRMs don't. Lean into it: *"you win 82% of gaskets and 31% of bearings — stop discounting gaskets."*

### Refuse, or at least defer past v2

Every one of these is a request you will get, and every one will sink you if you say yes early.

- **Accounting, invoicing, ledgers, GST returns.** Tally's territory, regulated, infinite feature requests. Integrate; never rebuild.
- **Full inventory management.** Stock, batches, warehouses, godowns. Different product, ten times the surface area.
- **Becoming a general CRM.** Deal stages, activities, email sync, lead scoring. Zoho does this for ~₹800/user and will always out-feature you. Stay the quotation layer.
- **Per-customer bespoke features.** The classic internal-tool-to-SaaS death: your first three customers each get a custom module and you now maintain three products. Make everything configuration, or say no.
- **On-premise / self-hosted.** Asked for constantly by Indian manufacturers. It destroys your ability to ship. Answer with a security page and a data-export guarantee instead.
- **A native mobile app.** A good responsive web app plus WhatsApp covers 95% of the need at 10% of the cost.
- **Multi-currency and international.** Not until an Indian beachhead is profitable. Focus is the only advantage you have over Zoho.

---

## 07 — QuoteFlow versus Tally

**Tally is not your competitor. Tally is your distribution channel, your integration target, and the reason your buyer already believes business software is worth paying for.** Understanding exactly where the two products touch is the difference between a wedge and a losing fight.

### 7.1 What Tally actually is

TallyPrime is accounting-first: ledgers, vouchers, GST compliance, e-invoicing, e-way bills, inventory, payroll, statutory reports. It is sold as a perpetual desktop licence plus an annual subscription (TSS) for updates, through a very large partner and reseller network, and it is installed in a large share of Indian SMEs — the figure usually cited is over two million businesses. It is trusted by the accountant, the owner, and the CA who audits them.

Tally *does* have quotation-adjacent capability: sales-order and quotation voucher types, price levels and price lists, party-wise reporting. That is where the products touch. What it does not have — and what its architecture makes unlikely — is win/loss learning, per-line pricing intelligence, image-to-quote capture, or a pre-sale pipeline that includes deals that never became a voucher.

### 7.2 Head to head

| Dimension | TallyPrime | QuoteFlow (target v1) | Who wins |
|---|---|---|---|
| Core job | Record what happened, file it with the government | Decide what to quote, and win it | Different jobs |
| Where in the cycle | Post-order: invoice → ledger → return | Pre-order: requirement → quote → follow-up → win | **QuoteFlow** owns the gap |
| Quotation creation | Voucher entry, manual, keyboard-driven | Photo of a requirement sheet → draft in seconds | **QuoteFlow** |
| Pricing guidance | Price lists/levels you configure by hand | Learned from your own win/loss history per client per product | **QuoteFlow** |
| Win/loss analytics | N/A — lost deals never enter the books | Item-level won/lost/partial; win rates by client, supplier, product | **QuoteFlow** |
| Follow-up management | None | Ageing alerts on stale quotes | **QuoteFlow** |
| GST, e-invoice, e-way bill | Deep, certified, updated with the law | Tax fields on a quote, nothing statutory | **Tally** — don't compete |
| Inventory & stock | Full: batches, godowns, valuation | None | **Tally** |
| Accounting & audit | The system of record; the CA insists on it | None | **Tally** |
| Deployment | Desktop-first, LAN, remote access as an add-on | Cloud, browser, phone-friendly | **QuoteFlow** for field sales |
| Multi-user collaboration | Licensed per machine; awkward for a travelling sales team | Native, role-based, anywhere | **QuoteFlow** |
| Commercial model | Perpetual licence + annual TSS, sold via partners | Subscription, direct and via partners | Tally's model suits the Indian SME instinct better — see §09 |
| Trust & distribution | Decades of it, tens of thousands of partners, every CA | Zero | **Tally**, overwhelmingly |

> **"Tally tells you what you sold. QuoteFlow tells you what to quote so that you sell it."**

### 7.3 The strategic play

1. **Never say "instead of Tally".** Every prospect's first defensive question is "we already have Tally". The answer: *"Good — keep it. Tally starts when the order is confirmed. We handle everything before that, and hand the won quote to Tally as a sales order."*
2. **Build the Tally handoff early, in the cheapest form that works.** An "Export won quote → Tally XML" button covers most of the need. Tally imports XML natively and there are well-trodden XML/ODBC integration paths. This single button converts your biggest objection into a proof point.
3. **Recruit Tally partners as your channel.** There are thousands of small firms who sell, install and support Tally for SMEs. They have the exact customer list you want, they're already in the office monthly, and they're hungry for something new to sell that doesn't cannibalise Tally. Give them 20–30% recurring commission. Realistically this is your fastest path to the first hundred customers, and it's a channel Zoho and the international players don't work as hard.
4. **Borrow Tally's credibility in your copy.** "Works alongside your Tally" on the landing page removes more friction than any feature list.

*Verify Tally's current pricing, licence terms and the exact capabilities of the TallyPrime release in market before putting specific numbers in customer-facing material — these change with releases and I have not checked them against Tally's site today.*

---

## 08 — Everyone else you'll be compared to

| Competitor | What they are | Where they beat you | Where you beat them |
|---|---|---|---|
| **Excel + WhatsApp** | The real incumbent, in ~80% of your prospects | Free, familiar, infinitely flexible, zero training | Memory. Excel cannot tell you ₹480 won and ₹520 lost with this client. Also multi-user, alerts, and 20 minutes saved per quote. |
| **Zoho (CRM / Books / Inventory)** | The serious Indian SaaS incumbent, aggressive pricing, huge surface | Price, brand, breadth, integrations, an existing sales machine | They have quotes as a *document* feature, not a pricing-intelligence engine. No item-level win/loss learning, no requirement-sheet OCR. Specialist vs generalist. |
| **Vyapar / myBillBook / Marg** | Cheap Indian billing/GST apps for small traders | Very low price, mobile-first, massive install base | They're billing tools. No pre-sale pipeline, no analytics of consequence. They also anchor your prospect's price expectations downward — be ready. |
| **PandaDoc / Proposify / Qwilr** | Western proposal-document software | Beautiful documents, e-signature, template libraries | Priced in dollars, built for proposals not line-item industrial quoting, no cost/margin/supplier model, no India fit. |
| **QuoteWerks / DealHub / PROS / Vendavo** | CPQ and price-optimisation software | This is literally your Phase 3 vision, at enterprise scale, with real data science | They sell six-figure implementations to enterprises and will never come down-market. But study their *positioning language* — "price optimisation", "margin leakage", "win-rate lift" — it's the vocabulary you're growing into. |
| **Nothing / status quo** | The owner who says "my team manages fine" | Costs nothing, changes nothing | Your real fight. Beat it with a number from a real customer, not a feature list. |

**Where this leaves you:** the honest positioning is *"CPQ intelligence, priced for an Indian SME, that sits upstream of Tally."* Nobody credible occupies that square today. Narrow enough to win, broad enough to build a real business on — exactly what a first product should be.

---

## 09 — Pricing and packaging

Your existing pitch deck proposes three tiers at ₹2,999 / ₹6,999 / ₹14,999 per month. The structure is sound and the market read behind it is good. Four adjustments.

### 9.1 Fix the pricing metric

Flat-tier pricing with seat caps means a two-person firm and a seven-person firm both pay ₹6,999, and you have no expansion revenue as a customer grows. That kills net revenue retention, which is the number that makes a SaaS worth anything.

Move to **a small platform fee plus per-seat**: e.g. ₹1,999/month base (includes 2 seats) + ₹899/seat/month, annual prepay at 2 months free. Now growth inside an account grows your revenue automatically.

### 9.2 Meter the AI, don't give it away

Vision extraction has a real marginal cost and it's the feature people will hammer. Include a generous monthly page allowance per plan (say 200 / 1,000 / unlimited-fair-use) and sell top-ups. This also gives you a usage signal that predicts both expansion and churn.

### 9.3 Gate on value, not on arbitrary limits

| Tier | Who | Gate | Price direction |
|---|---|---|---|
| **Starter** | 1–3 person trading firm | Quoting, PDF, basic history, 200 AI pages | ~₹1,999 + ₹899/seat |
| **Growth** | 4–10 salespeople, an owner who wants control | + Role-based cost hiding, approval workflow, full analytics, Tally export, 1,000 AI pages | ~₹4,999 + ₹899/seat |
| **Enterprise** | Multi-branch, 10+ users | + Multi-branch scoping, SSO, audit export, dedicated onboarding, SLA | Quoted, ~₹15k+ |

Note what's gated: **cost-price hiding and approval workflow** are the Growth gate, because those are the owner-control features an owner will happily pay to unlock. **Never gate the pricing intelligence itself** — that's the reason they came.

### 9.4 Keep the paid-pilot instinct

The deck's advice to sell a paid pilot rather than a free trial is right for direct sales to Indian SMEs — payment creates the commitment that gets the data imported and the team trained. Run both motions: a self-serve 14-day trial for inbound signups, and a ₹4,999 paid onboarding pilot (credited to the first invoice) for anyone you sell to directly. **The pilot fee buys them your time doing the historical data import**, which is precisely the step that makes the product work.

> **One caution about the ROI table in your existing deck.** The "+₹90,000/month impact" numbers are constructed, not measured. Used as-is with a sharp buyer, they damage credibility. Replace them with one *real* number from your friend's company — quotes per month, hours saved, a specific deal recovered — even if it's smaller. One verified number beats a page of modelled ones. Get this before the relationship goes cold; it's the only case study you currently have access to.

---

## 10 — How to market this software

### 10.1 Positioning statement

> For Indian industrial trading and manufacturing firms whose salespeople quote from spreadsheets and memory, **QuoteFlow is the quoting layer that remembers every price you've ever quoted** — so your team quotes in minutes, at the price that actually wins, and no deal goes cold. It works alongside Tally; it doesn't replace it.

### 10.2 Pick a narrower beachhead than the deck does

The pitch deck lists ten industries. Ten industries means ten sets of vocabulary, ten sets of objections, and no word of mouth in any of them.

Pick **one vertical in one cluster** — the obvious choice is industrial rubber/sealing/gaskets, because you have a reference customer and the domain vocabulary already, in a cluster like Ludhiana, Rajkot, Coimbatore or Pune. Win fifteen firms in one cluster and the sixteenth calls you. Then port the playbook to the adjacent vertical.

### 10.3 The message hierarchy

- **Hook (10 seconds):** the WhatsApp photo becoming a filled quote. Show it, don't describe it. This is your entire top of funnel — visual, instantly legible, and the thing people forward to a friend.
- **Hold (2 minutes):** price history. *"Last time you quoted this client ₹480 you won; at ₹520 you lost."* Owners physically lean in at this.
- **Close (the owner's real fear):** *"When your senior salesperson leaves, his pricing knowledge stays in your system."* In family-run Indian trading firms this is the most powerful sentence in your deck. Lead with it when you're selling to the owner rather than the sales head.

### 10.4 Channels, ranked by expected return

| # | Channel | Why | First action |
|---|---|---|---|
| 1 | **Tally partners & resellers** | They already sell software to exactly your ICP, monthly, in person. Highest-leverage channel available to you. | Sign 3 partners in your chosen cluster at 25% recurring commission, with a 30-minute demo script. |
| 2 | **Industry associations & clusters** | MSME clusters, trade bodies, FIEO/CII chapters. Tight networks; word of mouth travels in weeks. | Sponsor one association event; offer members a group discount. |
| 3 | **Founder-led direct outreach** | Your first 20 customers should come from you personally. It's also the only way to learn the objections. | 50 LinkedIn/phone touches a week to owners and sales heads; demo within 24 hours of interest. |
| 4 | **Short video (WhatsApp / YouTube / Reels)** | The OCR demo is inherently shareable in a way most B2B software isn't. Vernacular versions massively outperform English in Tier 2/3. | One 45-second clip: requirement photo → finished quote. Hindi and Gujarati cuts. |
| 5 | **CA and consultant referrals** | CAs see the chaos, are trusted, and hold a portfolio of SME clients. | Referral fee or free seat; a one-page explainer they can forward. |
| 6 | **SEO / comparison content** | Slow, compounding. "quotation software for traders", "alternative to Excel quotations", "quotation format with GST". | Free GST quotation-format template as a lead magnet — high intent, trivially cheap. |
| 7 | **Paid ads** | Last resort. This buyer doesn't search for a category that doesn't exist yet. | Don't, until you can quote CAC payback from the channels above. |

### 10.5 The sales motion

1. **Demo with their data, not yours.** Ask for one requirement-sheet photo before the call and have their real products on screen. Conversion roughly doubles versus a generic demo — the single highest-return thing in the whole motion.
2. **Demo to the owner, not just the sales head.** The sales head sees a tool that monitors him. The owner sees institutional memory he currently doesn't own.
3. **Close on the paid pilot,** which includes you importing their last 12 months of quotes. That import is what makes the product visibly work in week one instead of month three.
4. **Define activation and chase it:** an org is activated when it has 10 saved quotes and 2 active users. Everything in onboarding should aim at that; measure it weekly.
5. **Ask for the referral at the first "wow",** not at renewal. In cluster markets, that's how the second customer happens.

### 10.6 Objections you'll actually hear

| Objection | Answer |
|---|---|
| "We have Tally." | "Keep it. Tally starts at the order. We're everything before that — and we hand the won quote to Tally." |
| "Our data is too sensitive for cloud." | A security page, encryption at rest and in transit, role-based cost hiding, one-click full export, a named person accountable. Then: "your cost prices are currently in a WhatsApp group and three laptops." |
| "My team won't use it." | Don't argue — do the import for them and train in one 90-minute session. Adoption is your job, not theirs. Track the activation metric and intervene at day 7. |
| "Too expensive." | Reframe per quote: "₹5,000 a month across 80 quotes is ₹62 a quote. One recovered deal covers the year." Never discount the list price — discount the term (annual prepay). |
| "Can you add [X] for us?" | The internal-tool trap. "Not as custom work. Tell me the problem — if three customers have it, it's on the roadmap." |

---

## 11 — The numbers that tell you if it's working

Instrument these from day one — retrofitting analytics after you have customers means a year of blind quarters.

| Metric | Definition for QuoteFlow | Healthy signal |
|---|---|---|
| Time to first quote | Signup → first saved quotation | < 30 minutes |
| Activation rate | Orgs reaching 10 quotes + 2 users in 14 days | > 40% |
| Weekly active quoting | Orgs saving ≥ 3 quotes/week | The real retention metric — not logins |
| History-panel usage | % of saved items where price history was opened | Proves the differentiator is used, not just shipped |
| Logo churn | Monthly cancelled orgs | < 2%/month |
| Net revenue retention | Expansion from seats + AI top-ups minus churn | > 100% |
| CAC payback | Fully loaded acquisition cost ÷ monthly gross margin | < 12 months |
| AI cost per org | Vision spend ÷ subscription revenue | < 10% of revenue |
| Support load | Tickets per org per month | Rising = an onboarding or UX defect, not a staffing problem |

---

## 12 — Decisions only you can make

None of the work above should start until these are settled, because each one changes the plan materially.

1. **Rebuild or extract?** My recommendation: keep the repo, keep the UI, rewrite the data layer and auth in place. The React surface is the valuable part and it's genuinely decent. A greenfield rewrite loses six months for a cleaner `git log`.
2. **Are you the developer, or hiring one?** Phase 1 is unglamorous infrastructure work. If you're doing it alone alongside a job, double every estimate and cut Phase 3 entirely from the v1 plan.
3. **Can you get the case study?** Your friend's company stopped using it. Before that relationship goes cold, get: quotes per month, hours saved, one specific deal the system saved, and permission to use the name. Also ask the harder question — **why did they stop?** That answer is the most valuable market research available to you, and it likely names your first retention problem.
4. **Which vertical, which cluster?** One of each. Write it down before building — it determines the import formats, the vocabulary, and the PDF template.
5. **Do you have a channel relationship?** If you can sign two Tally partners before writing code, the whole plan de-risks. If you can't, the direct motion needs to be sharper and the timeline is longer.
6. **What's the funding envelope?** Roughly ₹1–2 lakh/month covers infrastructure, AI, tools and legal at low volume. Fourteen weeks of work plus six months of runway to first revenue is the honest ask.

---

*Section 07's Tally details and section 09's price points should be re-verified against current public information before they go into any customer-facing material.*
