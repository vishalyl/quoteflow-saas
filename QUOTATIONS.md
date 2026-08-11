# Quotations Tab — Complete Feature Reference

## Overview

The Quotations tab is the core of QuoteFlow. It tracks every outbound price quote sent to clients, records costs and margins at the line-item level, and surfaces historical pricing intelligence at the moment of quoting.

---

## 1. Quotations List (`/quotations`)

### What you see

| Column | Description |
|--------|-------------|
| Date | The date on the quotation |
| Company | Client the quotation was sent to |
| Supplier | Primary supplier (if set) |
| Items | Number of line items |
| Status | Colour-coded badge (see Status System below) |
| Created | When the record was added to the database |
| — | "View →" link to open the detail page |

### Filtering

Five toggle buttons sit in the top-right:

- **All** — shows every quotation regardless of status
- **Won** — only fully-won quotations
- **Partial Win** — at least one item won, others not
- **Lost** — all items lost
- **Pending** — no items won yet

Only one filter is active at a time. Clicking the same filter again does nothing; click a different one to switch.

### Sorting

Click the **Date** or **Company** column header to sort by that field. A second click on the same header reverses the direction. The active sort column shows ↑ (ascending) or ↓ (descending); inactive columns show a faded ↕.

Default order on load: newest `created_at` first.

### Starting a new quotation

The **+ New Quotation** button (top-right, blue) navigates to `/quotations/new` and opens the 4-step creation wizard.

---

## 2. Creating a New Quotation (`/quotations/new`)

A step indicator at the top tracks progress through four stages: **Upload → Details → Mapping & Items → Preview**.

Draft state is kept in a Zustand store (`quotationDraftStore`) so you don't lose work if you navigate away mid-flow and come back.

---

### Step 1 — Upload Requirements

**What it does:** Extracts a product table from one or more images (photos, screenshots of RFQs, supplier sheets, etc.) using OpenAI's GPT-4o-mini vision model.

**How to use:**
1. Drag-and-drop images onto the drop zone, or click to browse. Up to 10 images at once.
2. A progress bar appears while the AI analyses the images.
3. On success, extracted rows (product name, quantity, unit, rate) are pre-filled into the item table and you advance automatically to step 3.

**If the upload fails or you have no image:** Click **Manual Entry / Skip Upload →** to jump straight to step 2 with a blank row ready to fill in.

The AI reads columns in this order: product name → quantity → unit → rate. It does not extract cost prices (those are your internal data).

---

### Step 2 — Company & Date Details

Fields available here:

| Field | Notes |
|-------|-------|
| Company (Client) | Searchable dropdown — type to filter existing companies |
| Date | Date picker, defaults to today |
| Derived Status | Read-only badge showing the auto-calculated status from current item statuses |
| Bulk Set Items To… | Dropdown to set every item to Pending / Won / Lost in one click |

Click **Continue to Item Mapping →** to proceed.

---

### Step 3 — Item List & Mapping

This is where you review, edit, and enrich all line items before saving.

The editable table has these columns:

| Column | Editable? | Notes |
|--------|-----------|-------|
| History | Button | Opens Price History Modal (only after saving to DB) |
| # | No | Row number |
| Product & Mapping | Yes | Free-text description + Map Product button |
| Qty | Yes | Number input |
| Unit | Yes | Text input (e.g. pcs, kg, m) |
| Supplier | Yes | Dropdown from the suppliers database |
| Cost Price | Yes | Your purchase price (per unit) |
| Quoted Price | Yes | Price you're quoting to the client (per unit) |
| Margin % | Auto + editable | Auto-calculates from cost/quoted; editing it back-calculates quoted price |
| Item Status | Yes | Pending / Won / Lost per line item |
| × | Button | Removes the row |

**+ Add Row** appends a blank row at the bottom.

**Pricing auto-calculations:**
- Change Cost Price or Quoted Price → Margin recalculates automatically.
- Change Margin % → Quoted Price recalculates automatically.
- Margin is always cost-based: `(quoted − cost) / cost × 100`.
- Margin field is locked (greyed out) if either cost or quoted price is missing.

**Mapping a product:** Click **+ Map Product** under any product description to open the Product Mapping Modal (see Section 4). Once mapped, the button turns green and shows "✓ Mapped". Mapping links the raw free-text name to a canonical master product, enabling grouped historical intelligence.

**Save to Master Database:** Clicking **💾 Save to Master Database** creates the quotation and all its items in Supabase immediately. The badge "✓ Saved to Database" appears in the section header. After saving, History buttons activate for each row.

**Next: Final Preview →** advances to step 4 without saving (save separately).

---

### Step 4 — Final Quotation Preview

Shows two panels:

**Quotation Preview table** (via PreviewPanel): A clean formatted view of all items with product, qty, unit, and quoted price.

**Order Profitability card:**
- **Order Profitability** — total profit = sum of (quoted − cost) × qty across all items, in ₹.
- **Avg. Margin** — average margin % across all rows that have a margin set.

**Finalisation options:**
- **📄 Client View** — opens the Client View Modal (see Section 5).
- **Save to Quotation Database** — clears the draft and navigates back to `/quotations`. (Note: the actual DB insert happens at step 3 via "Save to Master Database". This button finalises the flow and clears the in-progress draft.)

---

## 3. Quotation Detail Page (`/quotations/:id`)

Opened by clicking **View →** on any row in the list. This is the full editing interface for an existing quotation.

---

### Header

| Element | Description |
|---------|-------------|
| Page title | "Quotation Detail" |
| Subtitle | Company name · date · status badge |
| ← Back | Returns to `/quotations` |
| 👁 Client View | Opens Client View Modal |
| 💾 Save to Master | Saves all unsaved changes (header + all items) to Supabase |

All edits on this page are local (in React state) until you click **Save to Master**. Navigating away without saving loses changes.

---

### Meta Section (header card)

| Field | Editable? | Notes |
|-------|-----------|-------|
| Company | Yes | Dropdown of all companies; de-duplicated by name |
| Calculated Status | Display + bulk | Read-only badge showing the auto-derived status; includes Bulk Set Items To… dropdown |
| Date | Yes | Date picker |
| Notes | Yes | Free-text field |

**Bulk Set Items To…** — choosing Pending / Won (All Secured) / Lost (All Failed) from this dropdown updates every item's status simultaneously and recalculates the overall status badge.

---

### Items Table

Same columns as the upload EditableTable, with one addition — **Line Total** (quoted price × quantity, displayed as ₹).

Every cell is editable inline. Changes are held in local state; nothing persists until you hit **Save to Master**.

**Per-row actions:**
- **📈 History** — opens Price History Modal for that product/company combination.
- **× delete button** — removes the row. If the item exists in the DB (not a new row), it is immediately deleted from Supabase when you click × (no undo).

**+ Add Row** appends a blank new row. New rows are inserted into Supabase when you next click Save to Master.

---

### Totals Bar

Displayed below the items table:

| Metric | When shown | Colour |
|--------|------------|--------|
| Total Quoted | Always | Blue/primary |
| Total Cost | Only when at least one cost price is set | Default |
| Total Profit | Only when total cost > 0 | Green if ≥ 0, red if negative |
| Avg Margin | Only when at least one margin is set | Green if ≥ 20%, amber otherwise |
| X accepted | Right side, when any item is won | Green pill |
| X rejected | Right side, when any item is lost | Red pill |
| N items total | Always | Muted |

---

### Export CSV

The detail page exposes an **Export CSV** function (called via `exportCSV()`). It downloads a `.csv` file named `quotation-<first 8 chars of UUID>.csv` containing:

```
#, Product, Qty, Unit, Supplier, Cost Price, Margin %, Quoted Price, Line Total, Item Status
```

---

## 4. Product Mapping Modal

Opened by clicking **+ Map Product** on any item row.

**Purpose:** Links a free-text product description (the "raw name" from the quotation) to a canonical master product in the database. This is what enables the Price History system to group the same physical product across quotations even when it was typed differently each time.

### Mode: Map to Existing

- A live search box filters all master products by name.
- Click any result to confirm the mapping.
- The mapping is written to the `product_mappings` table in Supabase immediately.

### Mode: Create as New Master

- **Master Product Name** — canonical name to create (pre-filled with the raw name).
- **Category** (optional) — e.g. Hydraulic, O-Ring, Seal.
- Click **Create Master & Map Product** — adds the product to `master_products` and creates the mapping in one step.

After either mode completes, the row's Map button turns green with "✓ Mapped" and the `master_product_id` is stored on that item.

---

## 5. Price History Modal

Opened by clicking **📈 History** on any item row. Requires the item to have been saved to the database (i.e. has a real DB id).

**What it shows:**

The modal is divided into two sections:

### Historical Purchases (This Company)

All past quotation items for the same master product (or raw name if unmapped) where the client company matches the current quotation. Columns:

| Column | Notes |
|--------|-------|
| Date | Date of that historical quotation |
| Exact Name (Raw) | How the product was described in that quote |
| Qty | Quantity and unit |
| Unit Price | Quoted price per unit |
| Total Cost | cost_price × qty |
| Total Margin | (quoted − cost) × qty, green if positive |
| Margin % | Cost-based margin; green ≥ 20%, amber otherwise |

### Intelligence From Other Projects

Same columns plus a **Company** column — shows pricing data for the same master product from all other client companies. This lets you benchmark what you've quoted to other clients for the same product.

**Intelligence quality indicator:**
- **● Broad Intelligence (Mapped Group)** — product is mapped to a master product; history is pulled from all items linked to that master product.
- **● Direct Intelligence (Exact Name Match)** — product is not mapped; history is only from rows with exactly the same raw text.

Clicking outside the modal or the ✕ button closes it.

---

## 6. Client View Modal

Opened by clicking **👁 Client View** on the detail page header, or **📄 Client View** on the upload preview step.

**Purpose:** A clean, printable quotation sheet for sending to clients. Strips out all internal data (cost prices, margins, suppliers).

**Columns shown to client:**
- # (row number)
- Description (raw product name)
- Qty
- Unit
- Price (quoted price per unit in ₹)

**Download:** Click **📥 DOWNLOAD** to save the sheet as a high-resolution JPEG (2× pixel ratio, white background). The file is named after the quotation title, e.g. `quotation-to-technova-industries.jpeg`.

Clicking outside the modal or the ✕ button closes it.

---

## 7. Status System

### Item-level statuses

Each line item independently carries one of three statuses:

| Status | Meaning |
|--------|---------|
| `pending` | Not yet confirmed won or lost |
| `won` | Client accepted this item |
| `lost` | Client rejected this item |

### Quotation-level statuses (auto-derived)

The overall quotation status is **automatically calculated** from item statuses every time an item status changes. You cannot set the quotation status directly — it derives from:

| Rule | Result |
|------|--------|
| All items are `won` | `won` |
| At least one item is `won`, but not all | `partial_win` |
| No items are `won`, at least one is `pending` | `pending` |
| No items are `won` and none are `pending` (all `lost`) | `lost` |

The colour-coded badges used throughout:

| Status | Badge colour |
|--------|-------------|
| `won` | Green |
| `partial_win` | Teal/cyan |
| `pending` | Amber/yellow |
| `lost` | Red |

---

## 8. Persistent Storage

All quotation data lives in Supabase (PostgreSQL). Nothing is stored in localStorage or in-browser state beyond the current session's draft (which uses Zustand in-memory only).

### Database tables

| Table | What it stores |
|-------|---------------|
| `quotations` | Header record: company_id, date, status, notes, created_at |
| `quotation_items` | Line items: raw_product_name, quantity, unit, cost_price, quoted_price, margin, supplier_id, master_product_id, item_status |
| `master_products` | Canonical product catalog: name, category |
| `product_mappings` | Maps raw_product_name → master_product_id |
| `companies` | Client companies |
| `suppliers` | Vendor suppliers |

### Operations and when they fire

| Operation | When |
|-----------|------|
| `createQuotation` | "💾 Save to Master Database" in step 3 of upload flow |
| `updateQuotation` | "💾 Save to Master" on the detail page |
| `insertQuotationItem` | Save on detail page for any row marked `_isNew` |
| `updateQuotationItem` | Save on detail page for any existing row |
| `deleteQuotationItem` | Immediately when clicking × on an existing item row |
| `upsertProductMapping` | Confirming a mapping in the Product Mapping Modal |
| `addMasterProduct` | Creating a new master product in the Product Mapping Modal |

### What is NOT auto-saved

- Edits to meta fields (company, date, notes, status) on the detail page
- Edits to item fields (prices, qty, unit, supplier, margin) on the detail page
- New rows added via "+ Add Row" on the detail page

All of the above require clicking **💾 Save to Master** to persist.

---

## 9. Toast Notifications

Brief pop-up messages appear at the bottom of the screen for 3 seconds:

| Trigger | Message | Type |
|---------|---------|------|
| Successful save | "Saved successfully!" | Success (green) |
| Save error | Error message from Supabase | Error (red) |
| No valid rows on upload save | "Add at least one product" | Error (red) |
| Successful upload save | "Saved to Master Database!" | Success (green) |
