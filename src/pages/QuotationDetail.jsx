import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import {
  getQuotationById, saveQuotation, deleteQuotation, getCompanies, getSuppliers,
  QuotationConflictError,
} from '../db/queries.js'
import ProductMappingModal from '../components/Modals/ProductMappingModal.jsx'
import PriceHistoryModal from '../components/Modals/PriceHistoryModal.jsx'
import ClientViewModal from '../components/Modals/ClientViewModal.jsx'
import { deriveQuotationStatus } from '../utils/statusUtils.js'
import { applyLineEdit, isMarginEditable, lineTotal, quotationTotals } from '../domain/pricing.js'
import { useOrgStore, canSeeCost } from '../stores/orgStore.js'

// ── helpers ──────────────────────────────────────────────────────────────────
const rupee = n => n != null && n !== '' && !isNaN(n)
  ? parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '—'

// ── style constants ───────────────────────────────────────────────────────────
const TH = {
  padding: '7px 8px', textAlign: 'left', color: 'var(--text-muted)',
  fontWeight: 600, fontSize: 10, letterSpacing: '0.05em',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
}
const TD = { padding: '5px 6px', verticalAlign: 'middle' }

// ── component ─────────────────────────────────────────────────────────────────
export default function QuotationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quot, setQuot]         = useState(null)
  const [items, setItems]       = useState([])
  const [companies, setCompanies] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)
  const [meta, setMeta]         = useState({})
  const [mappingIndex, setMappingIndex] = useState(null)
  const [historyIndex, setHistoryIndex] = useState(null)
  const [showClientView, setShowClientView] = useState(false)
  // The updated_at we loaded — our claim to be editing the current version.
  const [loadedAt, setLoadedAt] = useState(null)
  const [conflict, setConflict] = useState(false)

  // Salespeople never see supplier cost or margin. The database enforces this
  // too — hiding the columns is a courtesy, not the control.
  const role = useOrgStore((s) => s.role)
  const showCost = canSeeCost(role)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    Promise.all([getQuotationById(id), getCompanies(), getSuppliers()])
      .then(([data, comps, supps]) => {
        setQuot(data)
        setLoadedAt(data.updated_at ?? null)
        setSuppliers(supps)
        setItems((data.quotation_items || []).map(item => ({
          ...item,
          _localStatus: item.item_status || null,
          _isNew: false,
        })))
        setMeta({
          status: data.status,
          date: data.date,
          notes: data.notes || '',
          company_id: data.company_id || '',
        })
        const seen = new Set()
        setCompanies(comps.filter(c => {
          const k = c.name.trim().toLowerCase()
          if (seen.has(k)) return false
          seen.add(k); return true
        }))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  // ── item field logic ───────────────────────────────────────────────────────
  const updateItemField = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => i === idx ? applyLineEdit(item, field, value) : item))
  }

  const updateItemStatus = (idx, newStatus) => {
    setItems(prev => {
      const updated = prev.map((item, i) => i === idx ? { ...item, _localStatus: newStatus } : item)
      const derived = deriveQuotationStatus(updated)
      setMeta(m => ({ ...m, status: derived }))
      return updated
    })
  }

  const bulkSetItemsStatus = (status) => {
    setItems(prev => prev.map(item => ({ ...item, _localStatus: status })))
    setMeta(m => ({ ...m, status }))
  }

  const addRow = () => {
    setItems(prev => [...prev, {
      id: `new_${Date.now()}`,
      raw_product_name: '', quantity: '', unit: '',
      cost_price: '', quoted_price: '', margin: '',
      supplier_id: '', _localStatus: null, _isNew: true,
    }])
  }

  // Removing a row only stages the deletion — it is applied on save, so an
  // accidental click can still be undone by leaving without saving.
  const removeRow = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const openMapping = (idx) => setMappingIndex(idx)
  const openHistory = (idx) => setHistoryIndex(idx)

  const handleMappingComplete = async (mp) => {
    const updated = [...items]
    updated[mappingIndex] = {
      ...updated[mappingIndex],
      master_product_id: mp.id,
      master_product_name: mp.name
    }
    setItems(updated)
    setMappingIndex(null)
  }

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      // One transactional call: header and every line item land together, or
      // nothing does. Rows removed from the table are deleted server-side.
      // loadedAt guards against overwriting a colleague's concurrent save.
      const result = await saveQuotation(id, meta, items, loadedAt)
      setLoadedAt(result?.updated_at ?? null)
      const fresh = await getQuotationById(id)
      setItems((fresh.quotation_items || []).map(item => ({
        ...item,
        _localStatus: item.item_status || null,
        _isNew: false,
      })))
      showToast('Saved successfully!')
    } catch (err) {
      if (err instanceof QuotationConflictError) {
        setConflict(true)
      } else {
        showToast(err.message || 'Save failed', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  // Discard local edits and pick up whatever the colleague saved.
  const reloadAfterConflict = async () => {
    setConflict(false)
    setLoading(true)
    try {
      const fresh = await getQuotationById(id)
      setQuot(fresh)
      setLoadedAt(fresh.updated_at ?? null)
      setItems((fresh.quotation_items || []).map(item => ({
        ...item,
        _localStatus: item.item_status || null,
        _isNew: false,
      })))
      setMeta({
        status: fresh.status,
        date: fresh.date,
        notes: fresh.notes || '',
        company_id: fresh.company_id || '',
      })
      showToast('Reloaded the latest version.')
    } catch (err) {
      showToast(err.message || 'Reload failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('Delete this quotation? You can restore it from Settings → Trash.')) return
    try {
      await deleteQuotation(id)
      navigate('/quotations')
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error')
    }
  }

  // ── export CSV ─────────────────────────────────────────────────────────────
  const fmtDateExport = d => { if (!d) return ''; const [y,m,mo] = d.split('-'); const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${parseInt(mo)} ${mn[parseInt(m)-1]} ${y}` }
  const exportCSV = () => {
    const companyName = (companies.find(c => c.id === meta.company_id) || quot?.companies)?.name || 'Unknown'
    const rows = items.map((item, i) => {
      const qty = parseFloat(item.quantity) || 1
      const qp  = parseFloat(item.quoted_price) || 0
      return {
        '#': i + 1,
        'Company': companyName,
        'Date': fmtDateExport(meta.date),
        'Product': item.raw_product_name || '',
        'Qty': item.quantity || '',
        'Unit': item.unit || '',
        'Supplier': suppliers.find(s => s.id === item.supplier_id)?.name || '',
        // Omitted entirely for the sales role — exporting what the screen hides
        // would make the whole restriction pointless.
        ...(showCost ? {
          'Cost Price': item.cost_price || '',
          'Margin %': item.margin != null && item.margin !== '' ? parseFloat(item.margin).toFixed(2) : '',
        } : {}),
        'Quoted Price': item.quoted_price || '',
        'Line Total': (qp * qty).toFixed(2),
        'Status': item._localStatus || '',
      }
    })
    const safeName = companyName.replace(/[^a-z0-9]/gi, '_')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([Papa.unparse(rows)], { type: 'text/csv' })),
      download: `${safeName}_${meta.date || new Date().toISOString().slice(0, 10)}.csv`,
    })
    a.click(); URL.revokeObjectURL(a.href)
  }

  // ── totals ─────────────────────────────────────────────────────────────────
  const { totalQuoted, totalCost, totalProfit, avgMargin } = quotationTotals(items)
  const acceptedCount = items.filter(i => i._localStatus === 'won').length
  const rejectedCount = items.filter(i => i._localStatus === 'lost').length

  const currentCompany = companies.find(c => c.id === meta.company_id) || quot?.companies

  // ── guards ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>
  if (!quot)   return <div className="empty-state"><span className="empty-icon">❌</span><p>Quotation not found</p></div>


  // ── EDIT VIEW ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Quotation Detail</div>
          <div className="page-subtitle">
            {currentCompany?.name || 'No company'} · {meta.date}
            {meta.status && <span className={`badge badge-${meta.status}`} style={{ marginLeft: 10 }}>{meta.status}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/quotations" className="btn btn-secondary btn-sm">← Back</Link>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowClientView(true)}>👁 Client View</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇ Export CSV</button>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑 Delete</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? <><div className="spinner" /> Saving...</> : '💾 Save to Master'}
          </button>
        </div>
      </div>

      {conflict && (
        <div className="card mb-20" style={{ borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Someone else saved this quotation</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Your changes were not saved, so theirs are not overwritten. Reload to see
                their version — your edits on screen will be discarded.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={reloadAfterConflict}>
              Reload latest version
            </button>
          </div>
        </div>
      )}

      {/* Meta */}
      <div className="card mb-20">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <div className="form-group">
            <label>Company</label>
            <select value={meta.company_id} onChange={e => setMeta(m => ({ ...m, company_id: e.target.value }))}>
              <option value="">— No company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>Calculated Status & Bulk Actions</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <span className={`badge badge-${meta.status}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                {meta.status}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>|</span>
              <select 
                className="btn btn-ghost btn-xs" 
                style={{ width: 'auto', padding: '2px 8px', height: 28, fontSize: 13, border: '1px solid var(--border)' }}
                onChange={e => {
                  const s = e.target.value;
                  if (!s) return;
                  bulkSetItemsStatus(s);
                  e.target.value = '';
                }}
              >
                <option value="">Bulk Set Items To...</option>
                <option value="pending">Pending</option>
                <option value="won">Won (All Secured)</option>
                <option value="lost">Lost (All Failed)</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={meta.date} onChange={e => setMeta(m => ({ ...m, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input type="text" value={meta.notes} onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))} placeholder="Notes..." />
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="section-title">📦 Quotation Items</div>
          <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add Row</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)' }}>
                <th style={{ ...TH, width: 80, textAlign: 'center' }}>History</th>
                <th style={{ ...TH, width: 30 }}>#</th>
                <th style={{ ...TH, minWidth: 220 }}>Product & Mapping</th>
                <th style={{ ...TH, width: 60 }}>Qty</th>
                <th style={{ ...TH, width: 60 }}>Unit</th>
                <th style={{ ...TH, minWidth: 120 }}>Supplier</th>
                {showCost && <th className="stacked-header" style={{ ...TH, width: 85 }}><div>Cost</div>Price</th>}
                <th className="stacked-header" style={{ ...TH, width: 85 }}><div>Quoted</div>Price</th>
                <th className="stacked-header" style={{ ...TH, width: 100, textAlign: 'right' }}><div>Line</div>Total</th>
                {showCost && <th className="stacked-header" style={{ ...TH, width: 75, textAlign: 'right' }}><div>Margin</div>%</th>}
                <th style={{ ...TH, width: 130, textAlign: 'center' }}>Item Status</th>
                <th style={{ ...TH, width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const marginEditable = isMarginEditable(item)
                const total = lineTotal(item.quantity, item.quoted_price)

                return (
                  <React.Fragment key={item.id}>
                    <tr style={{ borderTop: '1px solid var(--border-subtle)', background: 'transparent' }}>
                      {/* History */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <button className="btn btn-ghost btn-xs btn-icon w-full"
                          style={{ color: 'var(--primary-light)', background: 'var(--primary-bg)' }}
                          onClick={() => openHistory(i)}>
                          📈 History
                        </button>
                      </td>
                      <td style={{ ...TD, color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      {/* Product */}
                      <td className="editable-td" style={{ minWidth: 220 }}>
                        <textarea className="td-input" rows="1"
                          style={{ minHeight: 38, resize: 'none', marginBottom: 4, display: 'block' }}
                          value={item.raw_product_name || ''}
                          onChange={e => updateItemField(i, 'raw_product_name', e.target.value)}
                          placeholder="Product description..." />
                        <button 
                          className={`btn btn-xs w-full ${item.master_product_id ? 'btn-success' : 'btn-secondary'}`}
                          style={{ fontSize: 10, height: 22, borderStyle: item.master_product_id ? 'solid' : 'dashed', opacity: 0.9 }}
                          onClick={() => openMapping(i)}
                        >
                          {item.master_product_id ? `✓ ${item.master_product_name || item.master_products?.name || 'Mapped'}` : '+ Map Product'}
                        </button>
                      </td>
                      {/* Qty */}
                      <td className="editable-td">
                        <input className="td-input" type="number"
                          value={item.quantity ?? ''}
                          onChange={e => updateItemField(i, 'quantity', e.target.value)}
                          placeholder="0" />
                      </td>
                      {/* Unit */}
                      <td className="editable-td">
                        <input className="td-input" type="text"
                          value={item.unit || ''}
                          onChange={e => updateItemField(i, 'unit', e.target.value)}
                          placeholder="pcs" />
                      </td>
                      {/* Supplier */}
                      <td className="editable-td">
                        <select className="td-input"
                          value={item.supplier_id || ''}
                          onChange={e => updateItemField(i, 'supplier_id', e.target.value)}>
                          <option value="">None</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      {/* Cost Price */}
                      {showCost && (
                        <td className="editable-td">
                          <input className="td-input" type="number" step="0.01"
                            value={item.cost_price || ''}
                            onChange={e => updateItemField(i, 'cost_price', e.target.value)}
                            placeholder="0.00" />
                        </td>
                      )}
                      {/* Quoted Price */}
                      <td className="editable-td">
                        <input className="td-input" type="number" step="0.01"
                          value={item.quoted_price || ''}
                          onChange={e => updateItemField(i, 'quoted_price', e.target.value)}
                          placeholder="0.00"
                          style={{ fontWeight: 600 }} />
                      </td>
                      {/* Line Total */}
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 600, fontSize: 13, color: total > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                        {total > 0 ? `₹${rupee(total)}` : '—'}
                      </td>
                      {/* Margin */}
                      {showCost && (
                        <td className="editable-td">
                          <input className="td-input" type="number" step="0.1"
                            value={item.margin ?? ''}
                            onChange={e => updateItemField(i, 'margin', e.target.value)}
                            placeholder={marginEditable ? '%' : 'locked'}
                            disabled={!marginEditable}
                            style={{
                              textAlign: 'right',
                              opacity: marginEditable ? 1 : 0.35,
                              background: marginEditable ? 'var(--bg-elevated)' : 'var(--bg-input)',
                              fontWeight: marginEditable ? 700 : 400
                            }} />
                        </td>
                      )}
                      {/* Item Status */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <select className="td-input"
                          value={item._localStatus || 'pending'}
                          onChange={e => updateItemStatus(i, e.target.value)}
                          style={{ fontSize: 11, height: 24, padding: '2px 4px' }}>
                          <option value="pending">Pending</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </td>
                      {/* Delete */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <button onClick={() => removeRow(i)}
                          style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>
                          ×
                        </button>
                      </td>
                    </tr>


                  </React.Fragment>
                )
              })}

              {items.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                    No items yet — click <strong>+ Add Row</strong> to begin
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals bar */}
        <div style={{
          marginTop: 14, padding: '16px',
          background: 'var(--bg-hover)', borderRadius: 8,
          display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Total Quoted</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary-light)' }}>₹{rupee(totalQuoted)}</div>
          </div>
          {showCost && totalCost > 0 && (
            <>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Total Cost</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>₹{rupee(totalCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Total Profit</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  ₹{rupee(totalProfit)}
                </div>
              </div>
            </>
          )}
          {showCost && avgMargin !== null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Avg Margin</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: avgMargin >= 20 ? 'var(--success)' : 'var(--warning)' }}>{avgMargin.toFixed(1)}%</div>
            </div>
          )}

          {/* Accept / Reject summary */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {acceptedCount > 0 && (
              <span style={{ fontSize: 11, background: 'rgba(16,185,129,0.15)', color: 'var(--success)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                {acceptedCount} accepted
              </span>
            )}
            {rejectedCount > 0 && (
              <span style={{ fontSize: 11, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                {rejectedCount} rejected
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{items.length} item{items.length !== 1 ? 's' : ''} total</span>
          </div>
        </div>
      </div>
      
      {mappingIndex !== null && (
        <ProductMappingModal 
          rawName={items[mappingIndex].raw_product_name} 
          onMappingComplete={handleMappingComplete}
          onClose={() => setMappingIndex(null)}
        />
      )}

      {historyIndex !== null && (
        <PriceHistoryModal 
          masterProductId={items[historyIndex].master_product_id}
          masterProductName={items[historyIndex].master_product_name || (items[historyIndex].master_products?.name)}
          rawProductName={items[historyIndex].raw_product_name}
          companyId={meta.company_id}
          onClose={() => setHistoryIndex(null)}
        />
      )}

      {showClientView && (
        <ClientViewModal 
          companyName={currentCompany?.name}
          rows={items}
          onClose={() => setShowClientView(false)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}
