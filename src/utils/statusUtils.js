/**
 * Automatically derives the overall quotation status based on its items.
 * 
 * Logic:
 * - WON: All items are 'won'.
 * - PARTIAL WIN: At least one item is 'won', but some are not.
 * - PENDING: No items are 'won', and at least one item is still 'pending'.
 * - LOST: All items are 'lost'.
 */
export function deriveQuotationStatus(items) {
  if (!items || items.length === 0) return 'pending'
  
  // Handle both database items (item_status) and local state items (_localStatus)
  const statuses = items.map(i => i._localStatus || i.item_status || 'pending')
  
  const hasWon = statuses.some(s => s === 'won')
  const allWon = statuses.every(s => s === 'won')
  const hasPending = statuses.some(s => s === 'pending')
  
  if (allWon) return 'won'
  if (hasWon) return 'partial_win'
  if (hasPending) return 'pending'
  
  return 'lost' // If none are won and none are pending, it must be lost
}
