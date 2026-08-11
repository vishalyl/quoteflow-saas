import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getCompanies, getCompanyById, getCompanyDeals, getMasterProducts, getSuppliers, updateQuotation, updateQuotationItem, deleteQuotationItem } from '../db/queries.js'
import Papa from 'papaparse'

const fmt = n => n != null ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

function flattenDeals(deals) {
  const rows = []
  deals.forEach(q => {
    if (!q.quotation_items?.length) {
      rows.push({
        id: `empty-${q.id}`, quotation_id: q.id, company_id: q.company_id, date: q.date, status: q.status,
        raw_product_name: '—', master_name: '—', quantity: null, unit: null, cost_price: null, quoted_price: null, margin: null, supplier: '—', supplier_id: '',
      })
    } else {
      q.quotation_items.forEach(item => {
        rows.push({
          id: item.id, quotation_id: q.id, company_id: q.company_id, date: q.date, status: q.status,
          raw_product_name: item.raw_product_name || '', master_name: item.master_products?.name || '—',
          master_product_id: item.master_product_id,
          supplier: item.suppliers?.name || '—', supplier_id: item.supplier_id || '',
          quantity: item.quantity, unit: item.unit || 'pcs', cost_price: item.cost_price, quoted_price: item.quoted_price, margin: item.margin,
        })
      })
    }
  })
  return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}

export default function CompanyDetail() {
  const { id } = useParams()
  const [company, setCompany] = useState(null)
  const [companies, setCompanies] = useState([])
  const [allRows, setAllRows] = useState([])
  const [masterProducts, setMasterProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const [editModal, setEditModal] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingEdit, setDeletingEdit] = useState(false)

  const [filters, setFilters] = useState({ status: '', dateFrom: '', dateTo: '', masterProductId: '' })

  const loadAll = useCallback(async () => {
    try {
      const [c, deals, mp, comps, supps] = await Promise.all([getCompanyById(id), getCompanyDeals(id), getMasterProducts(), getCompanies(), getSuppliers()])
      setCompany(c)
      setAllRows(flattenDeals(deals))
      // Deduplicate
      const seenMp = new Set()
      setMasterProducts(mp.filter(p => { const k = p.name.trim().toLowerCase(); if (seenMp.has(k)) return false; seenMp.add(k); return true }))
      const seenC = new Set()
      setCompanies(comps.filter(c => { const k = c.name.trim().toLowerCase(); if (seenC.has(k)) return false; seenC.add(k); return true }))
      setSuppliers(supps)
    } catch (err) { console.error(err) }
  }, [id])

  useEffect(() => { setLoading(true); loadAll().finally(() => setLoading(false)) }, [loadAll])

  const onSave = async () => {
    setSavingEdit(true)
    try {
      const f = editModal.form
      await updateQuotation(f.quotation_id, { company_id: f.company_id || null, status: f.status, date: f.date })
      if (!String(f.id).startsWith('empty-')) {
        await updateQuotationItem(f.id, {
          raw_product_name: f.raw_product_name,
          quantity: f.quantity,
          unit: f.unit,
          cost_price: f.cost_price,
          quoted_price: f.quoted_price,
          margin: f.quoted_price && f.cost_price ? ((f.quoted_price - f.cost_price) / f.quoted_price * 100) : f.margin,
          supplier_id: f.supplier_id || null
        })
      }
      await loadAll(); setEditModal(null)
    } catch (err) { alert(err.message) } finally { setSavingEdit(false) }
  }

  const onDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this item?')) return
    setDeletingEdit(true)
    try {
      const f = editModal.form
      if (!String(f.id).startsWith('empty-')) await deleteQuotationItem(f.id)
      await loadAll(); setEditModal(null)
    } catch (err) { alert(err.message) } finally { setDeletingEdit(false) }
  }

  const filtered = useMemo(() => {
    return allRows.filter(row => {
      if (filters.status && row.status !== filters.status) return false
      if (filters.dateFrom && (row.date || '') < filters.dateFrom) return false
      if (filters.dateTo && (row.date || '') > filters.dateTo) return false
      if (filters.masterProductId && row.master_product_id !== filters.masterProductId) return false
      return true
    })
  }, [allRows, filters])

  const visibleRows = showAll ? filtered : filtered.slice(0, 20)

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link to="/companies" style={{ color: 'var(--primary-light)', textDecoration: 'none' }}>← Companies</Link>
          </div>
          <div className="page-title">🏢 {company?.name}</div>
        </div>
        <button className="btn btn-secondary" onClick={() => {
          const fmtDate = d => { if (!d) return ''; const [y,m,mo] = d.split('-'); const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${parseInt(mo)} ${mn[parseInt(m)-1]} ${y}` }
          const rows = filtered.map(row => ({
            'Date': fmtDate(row.date),
            'Product (Raw)': row.raw_product_name || '',
            'Master Product': row.master_name === '—' ? '' : (row.master_name || ''),
            'Qty': row.quantity,
            'Unit': row.unit,
            'Supplier': row.supplier === '—' ? '' : (row.supplier || ''),
            'Cost Price': row.cost_price,
            'Quoted Price': row.quoted_price,
            'Margin %': row.margin != null ? parseFloat(row.margin).toFixed(2) : '',
            'Line Total': row.quoted_price && row.quantity ? (parseFloat(row.quoted_price) * (parseFloat(row.quantity) || 1)).toFixed(2) : '',
            'Status': row.status,
          }))
          const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv' })
          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
          a.download = `${(company?.name || 'company').replace(/[^a-z0-9]/gi, '_')}_deals_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
          URL.revokeObjectURL(url)
        }}>⬇ Export CSV</button>
      </div>

      {/* Filters — same style as Master Database, no search, no company */}
      <div className="card mb-20" style={{ padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Status</label>
            <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">All Status</option><option value="won">Won</option><option value="lost">Lost</option><option value="pending">Pending</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>Master Product</label>
            <select value={filters.masterProductId} onChange={e => setFilters({...filters, masterProductId: e.target.value})}>
              <option value="">All Products</option>
              {masterProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>From</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label className="label-sm" style={{ color: 'var(--text-muted)' }}>To</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
          </div>
          <div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setFilters({ status: '', dateFrom: '', dateTo: '', masterProductId: '' })}>✕ Clear</button>
          </div>
        </div>
      </div>

      <div className="card mb-20">
        <div className="table-wrapper">
          <table className="editable-table">
            <thead>
              <tr><th>Date</th><th>Status</th><th>Product</th><th>Qty</th><th>Unit</th><th>Cost</th><th>Quoted</th><th>Margin</th><th>Supplier</th><th></th></tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td><span className={`badge badge-${row.status}`}>{row.status}</span></td>
                  <td>{row.raw_product_name}</td>
                  <td style={{ textAlign: 'right' }}>{row.quantity}</td>
                  <td>{row.unit}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(row.cost_price)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(row.quoted_price)}</td>
                  <td style={{ textAlign: 'right' }}>{row.margin != null ? row.margin.toFixed(1) + '%' : '—'}</td>
                  <td>{row.supplier}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditModal({ form: { ...row } })}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && filtered.length > 20 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(true)}>Show all {filtered.length} rows</button>
            </div>
          )}
        </div>
      </div>

      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Edit Record</h3><button className="btn btn-ghost" onClick={() => setEditModal(null)}>✕</button></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 2fr) 1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="label-sm">Company</label>
                  <select value={editModal.form.company_id || ''} onChange={e => setEditModal({...editModal, form: {...editModal.form, company_id: e.target.value}})}>
                    <option value="">None</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Date</label><input type="date" value={editModal.form.date} onChange={e => setEditModal({...editModal, form: {...editModal.form, date: e.target.value}})} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Status</label><select value={editModal.form.status} onChange={e => setEditModal({...editModal, form: {...editModal.form, status: e.target.value}})}><option value="pending">pending</option><option value="won">won</option><option value="lost">lost</option></select></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Product Name</label><input type="text" value={editModal.form.raw_product_name} onChange={e => setEditModal({...editModal, form: {...editModal.form, raw_product_name: e.target.value}})} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Quantity</label><input type="number" value={editModal.form.quantity} onChange={e => setEditModal({...editModal, form: {...editModal.form, quantity: e.target.value}})} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Unit</label><input type="text" value={editModal.form.unit} onChange={e => setEditModal({...editModal, form: {...editModal.form, unit: e.target.value}})} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Cost Price</label><input type="number" value={editModal.form.cost_price} onChange={e => setEditModal({...editModal, form: {...editModal.form, cost_price: e.target.value}})} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="label-sm">Quoted Price</label><input type="number" value={editModal.form.quoted_price} onChange={e => setEditModal({...editModal, form: {...editModal.form, quoted_price: e.target.value}})} /></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label className="label-sm">Supplier</label>
                <select value={editModal.form.supplier_id || ''} onChange={e => setEditModal({...editModal, form: {...editModal.form, supplier_id: e.target.value}})}>
                  <option value="">None</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="flex justify-between mt-12">
                <button className="btn btn-danger" onClick={onDelete} disabled={deletingEdit}>{deletingEdit ? '...' : 'Delete'}</button>
                <div className="flex gap-8">
                  <button className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={onSave} disabled={savingEdit}>{savingEdit ? '...' : 'Save Changes'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
