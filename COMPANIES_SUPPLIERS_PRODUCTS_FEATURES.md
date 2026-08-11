# Companies, Suppliers & Products — Features & Functionality

---

## Part 1: Companies

### 1.1 Companies List Page (`/companies`)

**Source:** `src/pages/Companies.jsx`

#### Page Header
- **Title:** "Companies"
- **Subtitle:** Live count of unique companies (e.g., "10 companies"). Deduplication is done client-side — if two records share the same name (case-insensitive), only the first is shown.
- **"+ Add Company" button** — opens the Add Company modal (see Section 1.3).

#### Companies Table
Columns: `#` (index), `Company Name`, `Actions`

- **Company Name** — displayed as a clickable link (🏢 icon + name) in the primary accent color. Clicking navigates to the **Company Detail page** (`/companies/:id`).
- **Actions column** — one button per row:
  - **✏️ Edit** — opens the Edit Company modal pre-filled with that company's data.
- Empty state: "No companies yet" centered across all columns.

#### Deduplication Logic
Companies are deduplicated by lowercased name before rendering. The first occurrence of each name is kept; subsequent duplicates are silently dropped from the list view (but still exist in the database).

---

### 1.2 Company Detail Page (`/companies/:id`)

**Source:** `src/pages/CompanyDetail.jsx`

The detail page shows every quotation item ever linked to this company in a flat, filterable table.

#### Page Header
- **Breadcrumb:** "← Companies" link back to the list.
- **Title:** 🏢 + company name.
- **"⬇ Export CSV" button** — exports the currently *filtered* rows (not all rows) as a `.csv` file using PapaParse. The file downloads immediately as `export.csv`.

#### Filter Bar
A responsive grid of filters applied client-side to the full row dataset:

| Filter | Type | Behaviour |
|--------|------|-----------|
| Status | Dropdown | All Status / Won / Lost / Pending |
| Master Product | Dropdown | All Products or a specific master product (deduplicated) |
| From | Date picker | Excludes rows with date before this value |
| To | Date picker | Excludes rows with date after this value |
| ✕ Clear | Button | Resets all four filters to empty |

Filters combine with AND logic — a row must pass all active filters to appear.

#### Items Table
Columns: `Date`, `Status`, `Product`, `Qty`, `Unit`, `Cost`, `Quoted`, `Margin`, `Supplier`, *(edit button)*

- **Status** — color-coded badge (won / lost / pending).
- **Cost / Quoted** — formatted as `₹X,XX,XXX.XX` (Indian locale, 2 decimal places). Shows `—` if null.
- **Margin** — shown as `X.X%`. Shows `—` if null.
- **Pagination:** First 20 rows shown by default. If filtered results exceed 20, a **"Show all N rows"** button appears at the bottom. Clicking it expands to show all matching rows (no re-collapse).
- **Edit button** — opens the Edit Record modal for that row (see Section 1.4).

#### Data Flattening
Quotations that have no items still appear as a single placeholder row with `—` in all product/price fields, so empty quotations are visible and editable.

Rows are sorted newest-first by date.

---

### 1.3 Add / Edit Company Modal

Opened from the Companies list via "+ Add Company" or "✏️ Edit".

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Company Name | Text | Required. Cannot save if blank. |
| Contact / Info | Text | Optional. Placeholder: "Email, phone..." |
| Notes | Textarea | Optional. Monospace font, 3 rows. |
| Created Date | Read-only display | Only shown in Edit mode. Formatted in Indian locale. |

**Buttons:**
- **Cancel** — closes modal, no changes saved.
- **Add Company / Save Changes** — saves to Supabase. Disabled while saving or if Name is blank. Shows "Saving..." during the request. On success, shows a green toast ("Company added!" / "Company updated!") and reloads the list.
- **Delete** (Edit mode only, red) — triggers `window.confirm("Delete this company? All linked data will be unlinked.")`. If confirmed, deletes the company and closes the modal. Shows a success toast.

**Close:** Click the ✕ button or click the dark backdrop.

---

### 1.4 Edit Record Modal (Company Detail)

Opened by clicking "Edit" on any row in the Company Detail table.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| Company | Dropdown | Re-assign to a different company. Deduplicated list. |
| Date | Date picker | Quotation date. |
| Status | Dropdown | pending / won / lost |
| Product Name | Text | Raw product name (free text). |
| Quantity | Number | |
| Unit | Text | e.g., "pcs", "kg" |
| Cost Price | Number | |
| Quoted Price | Number | |
| Supplier | Dropdown | All suppliers in the system. |

Margin is **not editable here** — it is recalculated on save as `(quoted - cost) / quoted × 100` when both cost and quoted are present.

**Buttons:**
- **Delete** (red, left side) — `window.confirm` before deleting the item. Empty-row placeholders (quotations with no items) are silently skipped (nothing to delete from `quotation_items`). Reloads data after deletion.
- **Cancel** — closes without saving.
- **Save Changes** — updates both the parent quotation (company, status, date) and the item record (product, qty, unit, prices, supplier). Reloads and closes on success.

---

## Part 2: Suppliers

### 2.1 Suppliers List Page (`/suppliers`)

**Source:** `src/pages/Suppliers.jsx`

Structurally identical to the Companies list with these differences:

- **Title:** "Suppliers" / subtitle: "N suppliers".
- **Icon:** 🏭 (factory) instead of 🏢.
- **"+ Add Supplier" button** — opens Add Supplier modal.
- Clicking a supplier name navigates to `/suppliers/:id`.
- Same client-side deduplication by lowercased name.

---

### 2.2 Supplier Detail Page (`/suppliers/:id`)

**Source:** `src/pages/SupplierDetail.jsx`

Nearly identical to Company Detail with one key difference in the table:

- **Last column is "Company"** (the client the item was quoted to) instead of "Supplier".
- Breadcrumb: "← Suppliers".
- Title: 🏭 + supplier name.
- **"⬇ Export CSV"** — same behavior: exports current filtered rows as `export.csv`.

#### Filter Bar
Same four filters as Company Detail: Status, Master Product, From date, To date, and ✕ Clear.

#### Items Table
Columns: `Date`, `Status`, `Product`, `Qty`, `Unit`, `Cost`, `Quoted`, `Margin`, `Company`, *(edit button)*

- Same formatting rules (Indian locale, badges, `—` for nulls).
- Same 20-row pagination with "Show all N rows" button.

#### Edit Record Modal (Supplier Detail)
Same fields and behavior as Company Detail's edit modal (Section 1.4), with the same Save/Delete/Cancel logic.

The **"Company (Customer)"** dropdown reassigns which company the quotation belongs to. The **"Supplier"** dropdown reassigns which supplier fulfilled the item.

---

### 2.3 Add / Edit Supplier Modal

Same structure as the Add/Edit Company modal (Section 1.3):

| Field | Type | Notes |
|-------|------|-------|
| Supplier Name | Text | Required. |
| Contact / Info | Text | Optional. |
| Notes | Textarea | Optional, monospace, 3 rows. |
| Created Date | Read-only | Edit mode only, Indian locale. |

- **Toasts:** "Supplier added!" / "Supplier updated!" / "Deleted"
- **Delete confirmation:** "Delete this supplier? All linked data will be unlinked."

---

## Part 3: Products & Mappings

### 3.1 Products Page (`/products`)

**Source:** `src/pages/Products.jsx`

**Purpose:** Standardize the messy free-text product names that come from OCR/CSV uploads ("raw names") under clean canonical "master product" names. A raw name can be mapped to exactly one master product.

**Page Header**
- Title: "Products & Mappings"
- Subtitle: "Standardize raw names under master products"

The page is split into a **two-column grid**:

---

### 3.2 Left Panel — Raw Names

Title: "🕵️ Raw Names (N)" where N is the total count of distinct raw names across all quotation items.

**Filter input** (top-right of the panel header):
- Text input, placeholder "Filter names..."
- Filters the list in real-time by substring match (case-insensitive) against the raw name.

**Raw Name List** (scrollable, max height fills the viewport):

Each row shows:
- **Raw name** — the exact string as it appeared in uploaded documents (truncated with ellipsis if too long).
- **Occurrence count** — "Found X times" in small muted text below the name.
- **Mapping badge** (right side):
  - If mapped → green "won"-style badge showing the master product name it is mapped to.
  - If unmapped → amber "pending"-style badge showing "unmapped".

This panel is **read-only** — mappings are managed from the right panel.

---

### 3.3 Right Panel — Master Manager

Two stacked cards:

#### Card 1: Create Master Name

A single input + button row:
- **Text input** — type the new canonical master product name.
- **"+" button** — creates the master product in Supabase (`addMasterProduct`). Disabled while saving or if input is blank. Shows "..." during the request. On success: "Master name created!" toast, input clears, list reloads.

#### Card 2: Mapping Manager

Title: "📦 Mapping Manager (N)" where N is the count of unique master products.

Lists all master products (deduplicated by name, case-insensitive). Each row:
- **Master product name** (bold).
- **"See Children & Edit →"** link text in accent color (right side).
- The entire row is clickable — opens the **Master Product Edit Modal** (see Section 3.4).

---

### 3.4 Master Product Edit Modal

**Trigger:** Clicking any master product row in the Mapping Manager.

**Header:** The current master product name as the title.

Two sections inside the modal:

#### Section 1: Edit Master Name

- Text input pre-filled with the master product name, editable inline.
- **"Save Details" button** — updates the master product name in Supabase. Shows "..." during save. "Master details saved!" toast on success. Reloads data.
- **"Delete Master" button** (red) — `window.confirm("Are you sure you want to delete this master product? All mappings will be lost.")`. If confirmed, deletes the master product and all its mappings. "Master product deleted!" toast, modal closes, data reloads.

#### Section 2: Map Raw Children

Header: "Map Raw Children" label on the left + a **search input** ("Search children...") on the right that filters the raw names list in real-time.

A **2-column checkbox grid** of all raw names in the system. Behavior:

| State | Visual | Checkbox | Interaction |
|-------|--------|----------|-------------|
| Mapped to **this** master | Purple-tinted background | Checked | Click to **unmap** (sets mapping to null) |
| Mapped to a **different** master | 40% opacity, italic note showing other master's name | Disabled | Not clickable |
| Unmapped | Normal | Unchecked | Click to **map** to this master product |

Sorting: Raw names already mapped to this master product are **sorted to the top** of the list so they are immediately visible.

Mapping changes take effect **immediately** on checkbox toggle — no separate save button. The mapping list is refreshed after each toggle.

---

## Shared Behaviours Across All Three Sections

### Toast Notifications
All three pages show transient toast messages in the bottom corner:
- Green with ✓ for success.
- Red with ✕ for errors (displays the Supabase error message).
- Auto-dismisses after 3 seconds.

### Loading State
All pages show a full-screen spinner overlay with "Loading..." (or "Loading products...") while the initial data fetch is in progress.

### Empty States
- Companies / Suppliers list: "No companies/suppliers yet" centered in the table.
- Products raw list: renders empty if no quotation items exist yet.

### Deduplication
All three pages deduplicate their primary list by lowercased name client-side — the first occurrence per unique name is kept, duplicates are hidden from the UI but still exist in the database.

### Margin Recalculation on Edit Save
In both Company Detail and Supplier Detail edit modals, the margin field is not editable directly. On save it is recalculated as:

```
margin = (quoted_price - cost_price) / quoted_price × 100
```

If either price is missing, the existing margin value is preserved unchanged.
