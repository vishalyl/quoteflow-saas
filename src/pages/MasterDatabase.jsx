import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getMasterDatabase, getCompanies, getMasterProducts, getSuppliers,
  updateQuotation, updateQuotationItem, deleteQuotationItem, getQuotationById,
} from '../db/queries.js'
import ExportButton from '../components/shared/ExportButton.jsx'
import { deriveQuotationStatus } from '../utils/statusUtils.js'
import { useOrgStore, canSeeCost } from '../stores/orgStore.js'

const fmt = n => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'
const PAGE_SIZE = 100
const EXPORT_LIMIT = 2000

const EMPTY_FILTERS = {
  status: '', dateFrom: '', dateTo: '', marginMin: '', marginMax: '',
  companyId: '', masterProductId: '', search: '',
}

export default function MasterDatabase() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [companies, setCompanies] = useState([])
  const [masterProducts, setMasterProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editModal, setEditModal] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingEdit, setDeletingEdit] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)

  const role = useOrgStore((s) => s.role)
  const showCost = canSeeCost(role)

  // Filtering and paging happen in SQL, so changing a filter refetches rather
  // than slicing an array that may never have been complete.
  const loadPage = useCallback(async (targetPage = 0) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMasterDatabase(filters, {
        limit: PAGE_SIZE,
        offset: targetPage * PAGE_SIZE,
      })
      setRows(result.rows)
      setTotal(Number(result.total))
      setPage(targetPage)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    Promise.all([getCompanies(), getMasterProducts(), getSuppliers()])
      .then(([comps, mps, supps]) => {
        setCompanies(comps)
        setMasterProducts(mps)
        setSuppliers(supps)
      })
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => { loadPage(0) }, [loadPage])

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }))

  const startEdit = (row) => {
    setEditModal({
      form: {
        id: row.id,
        quotation_id: row.quotation_id,
        company_id: row.company_id || '',
        date: row.date,
        item_status: row.item_status || 'pending',
        supplier_id: row.supplier_id || '',
        raw_product_name: row.raw_product_name,
        quantity: row.quantity,
        unit: row.unit,
        cost_price: row.cost_price,
        quoted_price: row.quoted_price,
        margin: row.margin,
      },
    })
  }

  const saveEdit = async () => {
    setSavingEdit(true)
    try {
      const f = editModal.form
      await updateQuotationItem(f.id, {
        raw_product_name: f.raw_product_name,
        quantity: f.quantity,
        unit: f.unit,
        cost_price: f.cost_price,
        quoted_price: f.quoted_price,
        margin: f.quoted_price && f.cost_price
          ? ((f.quoted_price - f.cost_price) / f.cost_price * 100)
          : f.margin,
        supplier_id: f.supplier_id || null,
        item_status: f.item_status,
      })

      // The parent quotation's status is derived from its items, so it has to
      // be recalculated whenever one of them changes.
      const { quotation_items: items } = await getQuotationById(f.quotation_id)
      await updateQuotation(f.quotation_id, {
        status: deriveQuotationStatus(items),
        company_id: f.company_id || null,
        date: f.date,
      })

      await loadPage(page)
      setEditModal(null)
    } catch (err) {
      setError(`Save failed: ${err.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteEdit = async () => {
    if (!window.confirm('Delete this line item? The quotation itself is kept.')) return
    setDeletingEdit(true)
    try {
      await deleteQuotationItem(editModal.form.id)
      await loadPage(page)
      setEditModal(null)
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    } finally {
      setDeletingEdit(false)
    }
  }

  // Export pulls a larger slice with the same filters, rather than exporting
  // only what happens to be on screen.
  const fetchForExport = useCallback(async () => {
    const result = await getMasterDatabase(filters, { limit: EXPORT_LIMIT, offset: 0 })
    return result.rows
  }, [filters])

  const exportColumns = useMemo(() => {
    const columns = [
      { label: 'Date', key: 'date' },
      { label: 'Company', key: 'company_name' },
      { label: 'Product (Raw)', key: 'raw_product_name' },
      { label: 'Master Product', key: 'master_product_name' },
      { label: 'Qty', key: 'quantity' },
      { label: 'Unit', key: 'unit' },
      { label: 'Supplier', key: 'supplier_name' },
      { label: 'Quoted Price', key: 'quoted_price' },
      { label: 'Line Total', render: r => (Number(r.quoted_price) || 0) * (Number(r.quantity) || 1) },
      { label: 'Status', key: 'item_status' },
    ]
    if (showCost) {
      columns.splice(7, 0, { label: 'Cost Price', key: 'cost_price' })
      columns.splice(9, 0, {
        label: 'Margin %',
        render: r => r.margin != null ? parseFloat(r.margin).toFixed(2) : '',
      })
    }
    return columns
  }, [showCost])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1
  const lastRow = Math.min(total, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Master Database</div>
          <div className="page-subtitle">
            {total.toLocaleString('en-IN')} matching line item{total === 1 ? '' : 's'}
            {total > 0 && ` · showing ${firstRow}–${lastRow}`}
          </div>
        </div>
        <div className="flex gap-8">
          <ExportButton
            fetchData={fetchForExport}
            filename="master_database"
            columns={exportColumns}
          />
        </div>
      </div>

      {error && (
        <div className="card mb-20" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      <div className="card mb-20" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, alignItems: 'end' }}>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Search product</label>
            <input
              type="search"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
              placeholder="e.g. gasket"
            />
          </div>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Status</label>
            <select value={filters.status} onChange={e => setFilter('status', e.target.value)}>
              <option value="">All</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Company</label>
            <select value={filters.companyId} onChange={e => setFilter('companyId', e.target.value)}>
              <option value="">All companies</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Master product</label>
            <select value={filters.masterProductId} onChange={e => setFilter('masterProductId', e.target.value)}>
              <option value="">All products</option>
              {masterProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} />
          </div>
          <div className="flex-col gap-4">
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} />
          </div>
          <div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setFilters(EMPTY_FILTERS)}>
              ✕ Clear
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner" /><span>Loading records…</span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><span className="empty-icon">🗄️</span><p>No line items match these filters</p></div>
      ) : (
        <>
          <div className="table-wrapper mt-20">
            <table className="editable-table">
              <thead>
                <tr>
                  <th>Date</th><th>Company</th><th>Product (Raw)</th><th>Qty</th><th>Unit</th>
                  {showCost && <th>Cost</th>}
                  <th>Quoted</th>
                  {showCost && <th>Margin</th>}
                  <th>Status</th><th>Supplier</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontSize: 11 }}>{row.date}</td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{row.company_name || '—'}</td>
                    <td style={{ fontSize: 13 }}>{row.raw_product_name}</td>
                    <td style={{ textAlign: 'right' }}>{row.quantity ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.unit}</td>
                    {showCost && <td style={{ textAlign: 'right' }}>{fmt(row.cost_price)}</td>}
                    <td style={{ textAlign: 'right' }}>{fmt(row.quoted_price)}</td>
                    {showCost && (
                      <td style={{ textAlign: 'right', fontWeight: 600, color: row.margin >= 20 ? 'var(--success)' : (row.margin != null ? 'var(--warning)' : 'inherit') }}>
                        {row.margin != null ? `${Number(row.margin).toFixed(1)}%` : '—'}
                      </td>
                    )}
                    <td><span className={`badge badge-${row.item_status}`}>{row.item_status}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.supplier_name || '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => startEdit(row)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-8">
              <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => loadPage(page - 1)}>
                ← Previous
              </button>
              <button className="btn btn-secondary btn-sm" disabled={page + 1 >= pageCount} onClick={() => loadPage(page + 1)}>
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit record</h3>
              <button className="btn btn-ghost" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Company</label>
                  <select value={editModal.form.company_id || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, company_id: e.target.value } })}>
                    <option value="">None</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Date</label>
                  <input type="date" value={editModal.form.date || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, date: e.target.value } })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Item status</label>
                  <select value={editModal.form.item_status} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, item_status: e.target.value } })}>
                    <option value="pending">pending</option>
                    <option value="won">won</option>
                    <option value="lost">lost</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="label-sm">Product name</label>
                <input type="text" value={editModal.form.raw_product_name || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, raw_product_name: e.target.value } })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Quantity</label>
                  <input type="number" value={editModal.form.quantity || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, quantity: e.target.value } })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Unit</label>
                  <input type="text" value={editModal.form.unit || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, unit: e.target.value } })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {showCost && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label className="label-sm">Cost price</label>
                    <input type="number" value={editModal.form.cost_price || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, cost_price: e.target.value } })} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Quoted price</label>
                  <input type="number" value={editModal.form.quoted_price || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, quoted_price: e.target.value } })} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="label-sm">Supplier</label>
                <select value={editModal.form.supplier_id || ''} onChange={e => setEditModal({ ...editModal, form: { ...editModal.form, supplier_id: e.target.value } })}>
                  <option value="">None</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex justify-between mt-12">
                <button className="btn btn-danger" onClick={deleteEdit} disabled={deletingEdit}>
                  {deletingEdit ? 'Deleting…' : 'Delete'}
                </button>
                <div className="flex gap-8">
                  <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
                    {savingEdit ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
