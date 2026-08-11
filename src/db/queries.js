import { supabase } from '../lib/supabase.js'

// ===== COMPANIES =====
export async function getCompanies() {
  const { data, error } = await supabase.from('companies').select('*').order('name')
  if (error) throw error
  return data
}
export async function getCompanyById(id) {
  const { data, error } = await supabase.from('companies').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
export async function getCompanyDeals(companyId) {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*, master_products(name), suppliers(name))')
    .eq('company_id', companyId)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}
export async function getSupplierDeals(supplierId) {
  const { data, error } = await supabase
    .from('quotation_items')
    .select('*, master_products(name), suppliers(name), quotations!inner(id, date, status, company_id, companies(name))')
    .eq('supplier_id', supplierId)
    .order('date', { foreignTable: 'quotations', ascending: false })
  if (error) throw error
  return data
}
export async function addCompany(name, contact = null, notes = null) {
  const { data, error } = await supabase.from('companies').insert({ name, contact, notes }).select().single()
  if (error) throw error
  return data
}
export async function updateCompany(id, updates) {
  const { data, error } = await supabase.from('companies').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteCompany(id) {
  const { error } = await supabase.rpc('soft_delete', { p_table: 'companies', p_id: id })
  if (error) throw error
}

// ===== SUPPLIERS =====
export async function getSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data
}
export async function getSupplierById(id) {
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
export async function addSupplier(name, contact = null, notes = null) {
  const { data, error } = await supabase.from('suppliers').insert({ name, contact, notes }).select().single()
  if (error) throw error
  return data
}
export async function updateSupplier(id, updates) {
  const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteSupplier(id) {
  const { error } = await supabase.rpc('soft_delete', { p_table: 'suppliers', p_id: id })
  if (error) throw error
}

// ===== MASTER PRODUCTS =====
export async function getMasterProducts() {
  const { data, error } = await supabase.from('master_products').select('*').order('name')
  if (error) throw error
  return data
}
export async function addMasterProduct(name, category = null) {
  const { data, error } = await supabase.from('master_products').insert({ name, category }).select().single()
  if (error) throw error
  return data
}
export async function updateMasterProduct(id, updates) {
  const { data, error } = await supabase.from('master_products').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteMasterProduct(id) {
  const { error } = await supabase.rpc('soft_delete', { p_table: 'master_products', p_id: id })
  if (error) throw error
}

// ===== PRODUCT MAPPINGS =====
export async function getProductMappings() {
  const { data, error } = await supabase.from('product_mappings').select('*, master_products(name, category)')
  if (error) throw error
  return data
}
export async function upsertProductMapping(rawName, masterProductId) {
  const { data, error } = await supabase
    .from('product_mappings')
    // Mappings are unique per organisation, not globally — two customers can
    // both map "O-Ring 25" without colliding.
    .upsert({ raw_name: rawName, master_product_id: masterProductId }, { onConflict: 'org_id,raw_name' })
    .select().single()
  if (error) throw error
  return data
}
export async function deleteProductMapping(rawName) {
  const { error } = await supabase.from('product_mappings').delete().eq('raw_name', rawName)
  if (error) throw error
}

// ===== UNIQUE RAW PRODUCT NAMES (from all sources) =====
export async function getDistinctRawProductNames() {
  const [qr, rr] = await Promise.all([
    supabase.from('quotation_items').select('raw_product_name'),
    supabase.from('requirement_items').select('raw_product_name'),
  ])
  const allNames = [
    ...(qr.data || []).map(r => r.raw_product_name),
    ...(rr.data || []).map(r => r.raw_product_name),
  ]
  // Deduplicate case-insensitively, preserve best casing, track count
  const map = {}
  allNames.forEach(name => {
    const key = name.toLowerCase().trim()
    if (!map[key]) map[key] = { name, count: 0 }
    map[key].count++
  })
  return Object.values(map).sort((a, b) => b.count - a.count)
}

// ===== REQUIREMENTS =====
export async function getRequirements() {
  const { data, error } = await supabase
    .from('requirements').select('*, companies(name), requirement_items(id)').order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function getRequirementById(id) {
  const { data, error } = await supabase
    .from('requirements').select('*, companies(*), requirement_items(*)').eq('id', id).single()
  if (error) throw error
  return data
}
export async function createRequirement(companyId, date, notes, items) {
  const { data: req, error: re } = await supabase.from('requirements').insert({ company_id: companyId, date, notes }).select().single()
  if (re) throw re
  if (items?.length) {
    const { error: ie } = await supabase.from('requirement_items').insert(
      items.map(item => ({ requirement_id: req.id, raw_product_name: item.raw_product_name, quantity: item.quantity ? parseFloat(item.quantity) : null, unit: item.unit || null }))
    )
    if (ie) throw ie
  }
  return req
}

export async function updateRequirement(id, updates) {
  const { data, error } = await supabase.from('requirements').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function updateRequirementItem(id, updates) {
  const clean = { ...updates }
  if (clean.quantity) clean.quantity = parseFloat(clean.quantity)
  const { data, error } = await supabase.from('requirement_items').update(clean).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRequirementItem(id) {
  const { error } = await supabase.from('requirement_items').delete().eq('id', id)
  if (error) throw error
}

// ===== QUOTATIONS =====
export async function getQuotations() {
  const { data, error } = await supabase
    .from('quotations').select('*, companies(name), quotation_items(id)').order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function getQuotationById(id) {
  const { data, error } = await supabase
    .from('quotations').select('*, companies(*), quotation_items(*, master_products(name), suppliers(name))').eq('id', id).single()
  if (error) throw error
  return data
}
/** Thrown when someone else saved the quotation while this user was editing. */
export class QuotationConflictError extends Error {
  constructor() {
    super('Someone else saved changes to this quotation while you were editing it.')
    this.name = 'QuotationConflictError'
  }
}

/**
 * Saves a quotation and all of its line items in one transaction.
 *
 * Pass null as the id to create. Items keep their ids across saves, and items
 * missing from the array are deleted — so the array is the desired end state.
 * Either the whole save lands or none of it does.
 *
 * Pass the updated_at you loaded as `expectedUpdatedAt`: if a colleague saved
 * in the meantime, this throws QuotationConflictError instead of quietly
 * overwriting their prices. Returns { id, updated_at }.
 */
export async function saveQuotation(quotationId, header, items, expectedUpdatedAt = null) {
  const { data, error } = await supabase.rpc('save_quotation', {
    p_quotation_id: quotationId || null,
    p_expected_updated_at: expectedUpdatedAt,
    p_header: {
      company_id: header.company_id || null,
      date: header.date || null,
      status: header.status || 'pending',
      notes: header.notes || null,
    },
    p_items: (items || []).map(item => ({
      // Placeholder ids from unsaved rows are ignored server-side.
      id: item._isNew ? null : (item.id ?? null),
      raw_product_name: item.raw_product_name || '',
      quantity: item.quantity ?? null,
      unit: item.unit || null,
      cost_price: item.cost_price ?? null,
      quoted_price: item.quoted_price ?? null,
      margin: item.margin === '' ? null : (item.margin ?? null),
      supplier_id: item.supplier_id || null,
      master_product_id: item.master_product_id || null,
      item_status: item._localStatus || item.item_status || 'pending',
    })),
  })
  if (error) {
    if (error.message?.includes('QF_CONFLICT')) throw new QuotationConflictError()
    throw error
  }
  return data
}
export async function updateQuotation(id, updates) {
  const { data, error } = await supabase.from('quotations').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function updateQuotationItem(id, updates) {
  const clean = { ...updates }
  if (clean.quantity) clean.quantity = parseFloat(clean.quantity)
  if (clean.cost_price) clean.cost_price = parseFloat(clean.cost_price)
  if (clean.quoted_price) clean.quoted_price = parseFloat(clean.quoted_price)
  if (clean.margin) clean.margin = parseFloat(clean.margin)
  
  const { data, error } = await supabase.from('quotation_items').update(clean).eq('id', id).select().single()
  if (error) throw error
  return data
}
// Deletes are reversible: the row is hidden, not destroyed, and can be
// restored from Settings → Trash.
export async function deleteQuotation(id) {
  const { error } = await supabase.rpc('soft_delete', { p_table: 'quotations', p_id: id })
  if (error) throw error
}

export async function listDeleted() {
  const { data, error } = await supabase.rpc('list_deleted')
  if (error) throw error
  return data || []
}

export async function restoreDeleted(tableName, id) {
  const { error } = await supabase.rpc('restore_deleted', { p_table: tableName, p_id: id })
  if (error) throw error
}

/** Who changed this row, and what changed. */
export async function getRowHistory(tableName, rowId) {
  const { data, error } = await supabase.rpc('row_history', { p_table: tableName, p_row_id: rowId })
  if (error) throw error
  return data || []
}
export async function deleteQuotationItem(id) {
  const { error } = await supabase.from('quotation_items').delete().eq('id', id)
  if (error) throw error
}
export async function insertQuotationItem(quotationId, item) {
  const { data, error } = await supabase.from('quotation_items').insert({
    quotation_id: quotationId,
    raw_product_name: item.raw_product_name || '',
    quantity: item.quantity ? parseFloat(item.quantity) : null,
    unit: item.unit || null,
    cost_price: item.cost_price ? parseFloat(item.cost_price) : null,
    quoted_price: item.quoted_price ? parseFloat(item.quoted_price) : null,
    margin: item.margin != null && item.margin !== '' ? parseFloat(item.margin) : null,
    supplier_id: item.supplier_id || null,
    master_product_id: item.master_product_id || null,
    item_status: item.item_status ?? 'pending',
  }).select().single()
  if (error) throw error
  return data
}

// ===== MASTER DATABASE =====
/**
 * Filtered, paged line items.
 *
 * Filtering and paging happen in SQL. The previous version fetched every
 * matching row into the browser, which silently truncated at PostgREST's
 * 1,000-row cap — so large accounts saw an incomplete table with no warning.
 *
 * Returns { rows, total } where total is the full count before paging.
 */
export async function getMasterDatabase(filters = {}, { limit = 100, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('master_database', {
    p_status: filters.status || null,
    p_company_id: filters.companyId || null,
    p_master_product_id: filters.masterProductId || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_margin_min: filters.marginMin ?? null,
    p_margin_max: filters.marginMax ?? null,
    p_search: filters.search || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return { rows: data || [], total: data?.[0]?.total_count ?? 0 }
}

// ===== HISTORICAL =====
export async function getMasterProductHistory(masterProductId, rawProductName = null, companyId = null) {
  let query = supabase
    .from('quotation_items')
    .select('quoted_price, cost_price, margin, quantity, raw_product_name, suppliers(name), quotations!inner(date, status, company_id, companies(name))')

  if (masterProductId) {
    query = query.eq('master_product_id', masterProductId)
  } else if (rawProductName) {
    query = query.eq('raw_product_name', rawProductName)
  } else {
    return { sameCompany: [], otherCompanies: [], all: [] }
  }

  query = query.order('quotations(date)', { ascending: false })

  const { data, error } = await query
  if (error) throw error

  // Split into same company vs others
  const sameCompany = []
  const otherCompanies = []

  data?.forEach(item => {
    if (companyId && item.quotations?.company_id === companyId) {
      sameCompany.push(item)
    } else {
      otherCompanies.push(item)
    }
  })

  return { sameCompany, otherCompanies, all: data || [] }
}

// ===== DASHBOARD =====
/**
 * Every dashboard number, aggregated in SQL.
 *
 * This replaces two unbounded selects that pulled the whole database into the
 * browser. Six small aggregate queries run in parallel and return tens of rows
 * instead of tens of thousands, and the totals stay correct at any size.
 */
export async function getDashboardData({ months = 12 } = {}) {
  const [kpis, trend, clients, suppliers, products, attention] = await Promise.all([
    supabase.rpc('dashboard_kpis'),
    supabase.rpc('monthly_win_rate', { p_months: months }),
    supabase.rpc('client_pipeline_ranking', { p_limit: 20 }),
    supabase.rpc('supplier_performance_ranking', { p_limit: 20 }),
    supabase.rpc('top_products', { p_limit: 10 }),
    supabase.rpc('quotations_needing_attention'),
  ])

  const firstError = [kpis, trend, clients, suppliers, products, attention].find(r => r.error)
  if (firstError) throw firstError.error

  const alerts = attention.data || []
  const [companyWinLoss, supplierWinLoss] = await Promise.all([
    supabase.rpc('company_win_loss', { p_limit: 12 }),
    supabase.rpc('supplier_win_loss', { p_limit: 12 }),
  ])

  return {
    companyWinLoss: companyWinLoss.data || [],
    supplierWinLoss: supplierWinLoss.data || [],
    ...(kpis.data || {}),
    trend: trend.data || [],
    clientRanking: clients.data || [],
    supplierRanking: suppliers.data || [],
    topProducts: products.data || [],
    incomplete: alerts.filter(a => a.kind === 'incomplete'),
    staleFollowups: alerts.filter(a => a.kind === 'stale'),
  }
}

export async function getSupplierSpotlight(supplierId = null) {
  const { data, error } = await supabase.rpc('supplier_spotlight', { p_supplier_id: supplierId })
  if (error) throw error
  return data
}

export async function getCompanySpotlight(companyId = null) {
  const { data, error } = await supabase.rpc('company_spotlight', { p_company_id: companyId })
  if (error) throw error
  return data
}

// ===== TEAM =====
export async function listMembers() {
  const { data, error } = await supabase.rpc('list_members')
  if (error) throw error
  return data || []
}

export async function inviteMember(email, role = 'sales') {
  const { data, error } = await supabase.rpc('invite_member', { p_email: email, p_role: role })
  if (error) throw error
  return data
}

export async function setMemberRole(userId, role) {
  const { error } = await supabase.rpc('set_member_role', { p_user_id: userId, p_role: role })
  if (error) throw error
}

export async function removeMember(userId) {
  const { error } = await supabase.rpc('remove_member', { p_user_id: userId })
  if (error) throw error
}

export async function listInvitations() {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function revokeInvitation(id) {
  const { error } = await supabase.from('invitations').delete().eq('id', id)
  if (error) throw error
}

/** Joins an organisation this user's email was invited to, if any. */
export async function claimInvitation() {
  const { data, error } = await supabase.rpc('claim_invitation')
  if (error) throw error
  return data
}

export async function getAiUsage() {
  const { data, error } = await supabase.rpc('check_ai_quota', { p_pages: 0 })
  if (error) throw error
  return data
}

// ===== ORGANISATION =====
export async function updateOrganisation(id, updates) {
  const { data, error } = await supabase
    .from('organisations').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
