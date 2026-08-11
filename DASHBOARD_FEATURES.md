# Dashboard Features & Functionality

## Overview

The Dashboard (`src/pages/Dashboard.jsx`) is the main landing page of QuoteFlow. It provides a real-time business overview: pipeline health, alert actions, spotlight analytics for companies and suppliers, performance charts, and win-rate trends. All data is loaded once on mount via `getDashboardData()`.

---

## 1. KPI Cards (Top Row)

Five clickable metric cards sit across the top. Each is interactive — clicking opens a popup modal with full detail.

### 1.1 Estimated Pipeline
- **Icon:** 💰
- **Value:** Sum of `quoted_price × quantity` for all **pending** quotations, formatted in Indian currency (₹ Cr / L / exact).
- **Sub-label:** "Potential Revenue"
- **On click:** Opens the **Pipeline Depth Modal** (see Section 4.1).

### 1.2 Top Target Client
- **Icon:** 🎯
- **Value:** Name of the client (company) with the highest total pending pipeline value. Truncated at 13 characters with `…` if longer.
- **Sub-label:** Total pending value for that client (e.g., "₹12.4 L Pending").
- **On click:** Opens the **Client Pipeline Ranking Modal** (see Section 4.2).

### 1.3 Top Supplier
- **Icon:** 🚚
- **Value:** Name of the supplier with the highest total won/partial-win revenue across all quotation items. Truncated at 13 characters.
- **Sub-label:** Total won revenue for that supplier (e.g., "₹8.2 L Won").
- **On click:** Opens the **Supplier Performance Ranking Modal** (see Section 4.3).

### 1.4 Incomplete Data
- **Icon:** ⚠️
- **Value:** Count of pending quotations that have no line items, or all items have a `quoted_price` of zero/null. Dismissed items are excluded from the count (dismissals persist in `localStorage`).
- **Sub-label:** "click to view items"
- **On click:** Opens the **Incomplete Quotations Modal** (see Section 4.4).

### 1.5 Pending Follow-ups
- **Icon:** ⏰
- **Value:** Count of pending quotations that are 3 or more days old. Dismissed ones excluded.
- **Sub-label:** "3+ days awaiting"
- **On click:** Opens the **Pending Follow-ups Modal** (see Section 4.5).

---

## 2. Charts Section

Below the KPI row, four chart cards render in a CSS grid.

### 2.1 Company Spotlight (full-width)

A rich two-column panel for analysing a specific client company (or all companies combined).

**Left column:**
- **Company selector dropdown** — lists all companies sorted by deal count (most active first). Default is "All".
- **4 KPI stat boxes:**
  - **Total Deals** — number of quotations for the selected company (sub: pending count).
  - **Win Rate** — `(won + 0.5×partial) / closed × 100%`, color-coded green ≥60%, amber ≥40%, red below. Sub shows breakdown: `XW · XP · XL`.
  - **Avg Margin** — average margin % on won/partial-win items only.
  - **Won Revenue** — total `quoted_price × quantity` on won deals, plus date of the last deal.
- **Recent Quotations mini-list** — last 5 quotations for the selected company, sorted newest first. Each row shows the date and a color-coded status badge (Won / Partial / Lost / Pending). Clicking a row navigates to that quotation's detail page.

**Right column:**
- **Won Revenue — Last 6 Months** (Line chart, purple) — monthly sum of quoted revenue from won/partial-win items. Y-axis formatted in ₹ (Cr/L/exact). Shows empty state if no won data.
- **Deal Pipeline by Month** (Stacked bar chart) — last 8 months of quotation counts broken down by status (Won / Partial / Lost / Pending). Each bar segment is color-coded.

### 2.2 Supplier Spotlight (full-width)

Mirrors the Company Spotlight but focused on suppliers.

**Left column:**
- **Supplier selector dropdown** — lists all suppliers sorted by item count. Default is "All".
- **4 KPI stat boxes:**
  - **Total Items** — number of quotation line items linked to the selected supplier (sub: quotation count).
  - **Win Rate** — same formula as Company Spotlight. Color-coded.
  - **Avg Cost** — average `cost_price` across all items for the supplier.
  - **Avg Margin** — average margin % across all items; turns green if ≥20%.
- **Recent Items mini-list** — last 5 quotation items for the selected supplier sorted newest first. Each row shows the product name (truncated at 20 chars) and a status badge. Clicking navigates to that quotation's detail page.

**Right column:**
- **Average Margin Trend — Last 6 Months** (Bar chart, cyan) — monthly average margin % for the selected supplier. Y-axis shows `%`.
- **Top Products by Revenue** (Horizontal bar chart) — top 5 products by total `quoted_price × quantity` for the selected supplier. Bars are color-coded with the app's accent palette.

### 2.3 Win vs Loss by Supplier (half-width)

- **Supplier filter dropdown** — "All Suppliers" or any individual supplier. Changing the filter resets the drill-down state.
- **Doughnut chart** — shows Won / Partial / Lost / Pending counts as colored arcs:
  - Won → green, Partial → blue, Lost → red, Pending → amber.
- **Hint text:** "Click a segment for full drill-down popup"
- **On segment click:** Opens the **Chart Drill-down Modal** (see Section 4.6) filtered to the clicked status and scoped to quotations that include items from the selected supplier.

### 2.4 Win vs Loss by Company (half-width)

- **Company filter dropdown** — "All Companies" or any individual company. Changing the filter resets drill-down state.
- **Doughnut chart** — same color scheme as above, scoped to the selected company's quotations.
- **On segment click:** Opens the **Chart Drill-down Modal** scoped to that company.

---

## 3. Bottom Row (Two Cards)

### 3.1 Top Performing Products

A ranked list of the top 7 products by won/partial-win revenue.

- Each row shows:
  - Rank number (1–7, dim purple).
  - Product name (raw_product_name, truncated at ~220px).
  - Won Revenue (₹, formatted in Indian locale).
- A subtle background bar fills proportionally to the #1 product's revenue, giving a visual sense of relative scale.
- Static — no click interaction on individual rows.

### 3.2 Win Rate Performance Trend

Two stacked sub-sections inside this card:

**Line chart (top half):**
- Plots monthly win rate % for up to the last 12 months.
- `Win Rate = (won + 0.5×partial_win) / closed × 100` per month.
- Green line with filled area. Y-axis runs 0–100%. Hover shows exact win rate tooltip.
- X-axis labels are `YYYY-MM` month keys.

**Monthly Performance Highlights (bottom half):**
- Label: "Select Month for Detailed Breakdown".
- A 2-column grid of up to 6 months (most recent first). Each tile shows:
  - Month + Year (e.g., "Apr 2025").
  - Win rate badge — green background if ≥50%, amber if below. Shows `X% Win`.
  - Sub-text: `X Won / X Total`.
- **On click:** Opens the **Monthly Detail Modal** (see Section 4.7).

---

## 4. Modals (Popups)

All modals close by clicking the dark backdrop or the ✕ button in the header.

### 4.1 Pipeline Depth Modal

**Trigger:** Click the "Estimated Pipeline" KPI card.

- Title: "Estimated Pipeline Depth"
- Lists every pending quotation with its estimated value (`quoted_price × quantity` summed across all items).
- Each row shows:
  - Company name (bold).
  - Date.
  - Estimated value (₹, color-coded blue).
- Clicking a row navigates to that quotation's detail page and closes the modal.
- Scrollable up to 500px height.

### 4.2 Client Pipeline Ranking Modal

**Trigger:** Click the "Top Target Client" KPI card.

- Title: "Client Pipeline Ranking"
- Ranks all companies by total pending pipeline value (highest to lowest).
- Each row shows:
  - Rank number (`#1`, `#2`, …).
  - Company name.
  - Total pending value (₹ formatted).
  - Sub-label: "Pending Pipeline".
- Background fill bar shows relative rank proportional to #1.
- Not directly clickable to navigate (view-only ranking).

### 4.3 Supplier Performance Ranking Modal

**Trigger:** Click the "Top Supplier" KPI card.

- Title: "Supplier Performance Ranking"
- Ranks all suppliers by total revenue from won/partial-win quotation items.
- Same row layout as Client Ranking: rank, name, value, sub-label "Total Won Revenue".
- Background fill bar proportional to #1.

### 4.4 Incomplete Quotations Modal

**Trigger:** Click the "Incomplete Data" KPI card.

- Title: "Incomplete Quotations (No Prices)"
- Lists pending quotations that have zero items or all items with no quoted price. Dismissed items are hidden.
- Each row shows:
  - Company name (bold).
  - Creation date.
  - **"Don't show this anymore"** button (red text) — permanently dismisses that quotation from this alert. Dismissal is saved in `localStorage` key `irs_dismissed_quotations` and persists across sessions.
  - **"Edit →"** button — navigates to the quotation detail page.
- Clicking anywhere on the company name/date also navigates to the quotation.
- If all are dismissed: shows "All clear! No pending quotations with missing prices."

### 4.5 Pending Follow-ups Modal

**Trigger:** Click the "Pending Follow-ups" KPI card.

- Title: "Pending Follow-ups"
- Lists pending quotations that are 3+ days old. Dismissed ones are hidden.
- Each row shows:
  - Company name.
  - "Sent X days ago • YYYY-MM-DD".
  - **"Dismiss"** button — hides it permanently from this alert (saved to `localStorage` key `irs_dismissed_followups`).
  - **"Edit →"** button — navigates to the quotation.
- Warning-themed row background (amber tones).
- If all dismissed: shows "Great job! No pending quotations waiting for follow-up."

### 4.6 Chart Drill-down Modal

**Trigger:** Clicking a doughnut segment in the Win vs Loss charts (Sections 2.3 or 2.4).

- Title: "[Supplier/Company name or 'All'] - Detailed Drill-down"
- Two-column layout (max 1000px wide):

**Left panel:**
  - Doughnut chart (same colors: green/blue/red/amber) — interactive; clicking a segment changes the active filter.
  - **Status dropdown** — filter by Won / Partial Win / Lost / Pending.
  - **Count box** — shows how many quotations match the current filter.

**Right panel:**
  - Scrollable list of matching quotations for the active status.
  - Each row: date, company name, status badge, arrow `→`.
  - Clicking a row navigates to that quotation's detail page and closes the modal.

### 4.7 Monthly Detail Modal

**Trigger:** Clicking a month tile in the Win Rate Performance Trend card (Section 3.2).

- Title: "[Month Year] Report" (e.g., "April 2025 Report").
- Sub-header: "X Won / X Total • XX.X% Acceptance"
- Scrollable list of every quotation for that month.
- Each row: company name, date, and status badge.
- Clicking a row navigates to that quotation's detail page.

---

## 5. Data & State Details

### Currency Formatting (`formatINR`)
- ≥ ₹1 Cr (10,000,000): shown as `₹X.XX Cr`
- ≥ ₹1 L (100,000): shown as `₹X.X L`
- Below: exact Indian locale integer (e.g., `₹12,450`)

### Win Rate Formula
`(won + 0.5 × partial_win) / (won + partial_win + lost) × 100`
Pending quotations are excluded from the denominator.

### Persistence (localStorage)
| Key | Contents |
|-----|----------|
| `irs_dismissed_quotations` | JSON array of quotation IDs dismissed from Incomplete Data alert |
| `irs_dismissed_followups` | JSON array of quotation IDs dismissed from Follow-ups alert |

Dismissals survive page refresh and browser restart. They are only applied to alert counts and modal lists — not to any other part of the app.

### Loading / Error States
- While data is fetching: full-screen spinner overlay with "Loading dashboard..." text.
- If `getDashboardData()` returns null: empty state with 📊 icon and "No data available".
