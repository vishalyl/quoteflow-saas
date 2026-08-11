/**
 * The pricing engine — the one place margin maths happens.
 *
 * This logic used to be implemented twice, in QuotationDetail and in
 * EditableTable, with subtly different behaviour on empty inputs. Margin is a
 * number a business prices against, so the two copies disagreeing was a real
 * risk. There is now one implementation, and it is tested.
 *
 * Margin is always cost-based:  (quoted - cost) / cost * 100
 */

/** Parse a form value to a number. Empty, null and junk all become null. */
export function toNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

/** Format for display in an input: a 2-decimal string, or '' for nothing. */
export function format2(value) {
  const n = toNumber(value)
  return n === null ? '' : n.toFixed(2)
}

/**
 * Margin percentage from cost and quoted price.
 * Returns null when cost is missing or zero — you cannot express a margin on
 * a zero cost, and dividing by it would produce Infinity.
 */
export function marginPct(cost, quoted) {
  const c = toNumber(cost)
  const q = toNumber(quoted)
  if (c === null || c <= 0 || q === null) return null
  return ((q - c) / c) * 100
}

/** Quoted price implied by a cost and a target margin percentage. */
export function quotedFromMargin(cost, margin) {
  const c = toNumber(cost)
  const m = toNumber(margin)
  if (c === null || c <= 0 || m === null) return null
  return c * (1 + m / 100)
}

/** A line's total, treating a missing quantity as 1 (matching the UI). */
export function lineTotal(quantity, unitPrice) {
  const qty = toNumber(quantity) ?? 1
  const price = toNumber(unitPrice) ?? 0
  return qty * price
}

/**
 * Apply an edit to a line and recalculate whatever it implies.
 *
 * Editing cost or quoted price recalculates the margin; editing the margin
 * recalculates the quoted price. Returns a new row — never mutates.
 */
export function applyLineEdit(row, field, value) {
  const next = { ...row, [field]: value }

  if (field === 'cost_price' || field === 'quoted_price') {
    const pct = marginPct(next.cost_price, next.quoted_price)
    next.margin = pct === null ? '0.00' : pct.toFixed(2)
  } else if (field === 'margin') {
    const quoted = quotedFromMargin(next.cost_price, value)
    if (quoted !== null) next.quoted_price = quoted.toFixed(2)
  }

  return next
}

/** Whether the margin field should be editable for this line. */
export function isMarginEditable(row) {
  const cost = toNumber(row?.cost_price)
  return cost !== null && cost > 0
}

/** Roll a set of lines up into the numbers shown on the totals bar. */
export function quotationTotals(items = []) {
  let totalQuoted = 0
  let totalCost = 0
  const margins = []

  for (const item of items) {
    const qty = toNumber(item.quantity) ?? 1
    totalQuoted += (toNumber(item.quoted_price) ?? 0) * qty
    totalCost += (toNumber(item.cost_price) ?? 0) * qty
    const m = toNumber(item.margin)
    if (m !== null) margins.push(m)
  }

  return {
    totalQuoted,
    totalCost,
    totalProfit: totalQuoted - totalCost,
    avgMargin: margins.length
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : null,
    itemCount: items.length,
  }
}
