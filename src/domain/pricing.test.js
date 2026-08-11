import { describe, it, expect } from 'vitest'
import {
  toNumber, marginPct, quotedFromMargin, lineTotal,
  applyLineEdit, isMarginEditable, quotationTotals,
} from './pricing.js'
import { deriveQuotationStatus } from '../utils/statusUtils.js'

describe('toNumber', () => {
  it('parses numeric strings from form inputs', () => {
    expect(toNumber('120.50')).toBe(120.5)
    expect(toNumber(42)).toBe(42)
  })

  it('treats empty and junk as absent rather than zero', () => {
    // This matters: treating an empty cost as 0 would report a 100% margin.
    expect(toNumber('')).toBeNull()
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('abc')).toBeNull()
  })
})

describe('marginPct', () => {
  it('computes margin on cost', () => {
    expect(marginPct(100, 120)).toBeCloseTo(20)
    expect(marginPct(4201, 4750)).toBeCloseTo(13.068, 2)
  })

  it('goes negative when quoting below cost', () => {
    expect(marginPct(120, 100)).toBeCloseTo(-16.667, 2)
  })

  it('refuses to divide by a zero or missing cost', () => {
    expect(marginPct(0, 120)).toBeNull()
    expect(marginPct('', 120)).toBeNull()
    expect(marginPct(-5, 120)).toBeNull()
  })

  it('is null when there is no quoted price yet', () => {
    expect(marginPct(100, '')).toBeNull()
  })
})

describe('quotedFromMargin', () => {
  it('is the exact inverse of marginPct', () => {
    expect(quotedFromMargin(80, 25)).toBeCloseTo(100)
    expect(quotedFromMargin(100, 0)).toBeCloseTo(100)
  })

  it('round-trips without drifting', () => {
    // A salesperson typing a margin, then a price, must not see the margin move.
    const cost = 4201
    const quoted = quotedFromMargin(cost, 13.07)
    expect(marginPct(cost, quoted)).toBeCloseTo(13.07, 6)
  })

  it('needs a real cost', () => {
    expect(quotedFromMargin(0, 25)).toBeNull()
    expect(quotedFromMargin('', 25)).toBeNull()
  })
})

describe('lineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineTotal(3, 250)).toBe(750)
  })

  it('treats a missing quantity as one', () => {
    expect(lineTotal('', 250)).toBe(250)
    expect(lineTotal(null, 250)).toBe(250)
  })

  it('is zero without a price', () => {
    expect(lineTotal(5, '')).toBe(0)
  })
})

describe('applyLineEdit', () => {
  it('recalculates margin when cost changes', () => {
    const row = { cost_price: '', quoted_price: '120', margin: '' }
    expect(applyLineEdit(row, 'cost_price', '100').margin).toBe('20.00')
  })

  it('recalculates margin when quoted price changes', () => {
    const row = { cost_price: '100', quoted_price: '', margin: '' }
    expect(applyLineEdit(row, 'quoted_price', '150').margin).toBe('50.00')
  })

  it('recalculates quoted price when margin is typed', () => {
    const row = { cost_price: '200', quoted_price: '', margin: '' }
    expect(applyLineEdit(row, 'margin', '10').quoted_price).toBe('220.00')
  })

  it('zeroes the margin when the pair is incomplete', () => {
    const row = { cost_price: '100', quoted_price: '120', margin: '20.00' }
    expect(applyLineEdit(row, 'quoted_price', '').margin).toBe('0.00')
  })

  it('leaves the quoted price alone when margin is typed without a cost', () => {
    const row = { cost_price: '', quoted_price: '500', margin: '' }
    expect(applyLineEdit(row, 'margin', '20').quoted_price).toBe('500')
  })

  it('does not mutate the row it was given', () => {
    const row = { cost_price: '100', quoted_price: '120', margin: '' }
    applyLineEdit(row, 'cost_price', '50')
    expect(row.margin).toBe('')
  })
})

describe('isMarginEditable', () => {
  it('is only editable once a real cost exists', () => {
    expect(isMarginEditable({ cost_price: '100' })).toBe(true)
    expect(isMarginEditable({ cost_price: '0' })).toBe(false)
    expect(isMarginEditable({ cost_price: '' })).toBe(false)
    expect(isMarginEditable({})).toBe(false)
  })
})

describe('quotationTotals', () => {
  const items = [
    { quantity: 2, cost_price: 100, quoted_price: 120, margin: 20 },
    { quantity: 1, cost_price: 50, quoted_price: 75, margin: 50 },
  ]

  it('totals quoted, cost and profit across quantities', () => {
    const t = quotationTotals(items)
    expect(t.totalQuoted).toBe(315)   // 240 + 75
    expect(t.totalCost).toBe(250)     // 200 + 50
    expect(t.totalProfit).toBe(65)
  })

  it('averages margin over lines that have one', () => {
    expect(quotationTotals(items).avgMargin).toBe(35)
    expect(quotationTotals([{ quoted_price: 10 }]).avgMargin).toBeNull()
  })

  it('handles an empty quotation', () => {
    const t = quotationTotals([])
    expect(t.totalQuoted).toBe(0)
    expect(t.avgMargin).toBeNull()
    expect(t.itemCount).toBe(0)
  })
})

describe('deriveQuotationStatus', () => {
  const line = (status) => ({ item_status: status })

  it('is won only when every line is won', () => {
    expect(deriveQuotationStatus([line('won'), line('won')])).toBe('won')
  })

  it('is a partial win when some lines won and others did not', () => {
    expect(deriveQuotationStatus([line('won'), line('lost')])).toBe('partial_win')
    expect(deriveQuotationStatus([line('won'), line('pending')])).toBe('partial_win')
  })

  it('is lost only when every line is lost', () => {
    expect(deriveQuotationStatus([line('lost'), line('lost')])).toBe('lost')
  })

  it('is pending while anything is still open and nothing is won', () => {
    expect(deriveQuotationStatus([line('pending'), line('lost')])).toBe('pending')
  })

  it('treats an empty quotation as pending', () => {
    expect(deriveQuotationStatus([])).toBe('pending')
    expect(deriveQuotationStatus(null)).toBe('pending')
  })

  it('prefers the unsaved local status over the stored one', () => {
    const edited = [{ item_status: 'pending', _localStatus: 'won' }]
    expect(deriveQuotationStatus(edited)).toBe('won')
  })
})
