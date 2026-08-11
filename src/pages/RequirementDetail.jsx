import React, { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getRequirementById, updateRequirement, updateRequirementItem, getCompanies } from '../db/queries.js'
import HistoricalPanel from '../components/Intelligence/HistoricalPanel.jsx'

export default function RequirementDetail() {
  const { id } = useParams()
  const [req, setReq] = useState(null)
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [toast, setToast] = useState(null)
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ date: '', notes: '', company_id: '' })
  const [saving, setSaving] = useState(false)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = useCallback(() => {
    Promise.all([getRequirementById(id), getCompanies()])
      .then(([data, comps]) => {
        setReq(data)
        setItems(data.requirement_items || [])
        setMeta({ date: data.date, notes: data.notes || '', company_id: data.company_id || '' })
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

  useEffect(() => { load() }, [load])

  const updateItemField = (idx, field, value) => {
    setItems(prev => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateRequirement(id, {
        company_id: meta.company_id || null,
        date: meta.date,
        notes: meta.notes
      })
      for (const item of items) {
        await updateRequirementItem(item.id, {
          raw_product_name: item.raw_product_name,
          quantity: item.quantity,
          unit: item.unit
        })
      }
      showToast('Changes saved!')
      load()
    } catch (err) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const activeCompanyId = req?.companies?.id || meta.company_id

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>
  if (!req) return <div className="empty-state"><span className="empty-icon">❌</span><p>Requirement not found</p></div>

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Requirement Detail</div>
          <div className="page-subtitle">{req.companies?.name || 'No company'} · {req.date}</div>
        </div>
        <div className="flex gap-8">
          <Link to="/requirements" className="btn btn-secondary btn-sm">← Back</Link>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="card mb-20">
        <div className="form-grid">
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>COMPANY</div>
            <select
              value={meta.company_id}
              onChange={e => setMeta({ ...meta, company_id: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="">— No company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>DATE</div>
            <input type="date" value={meta.date} onChange={e => setMeta({ ...meta, date: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>ITEMS</div>
            <div style={{ fontWeight: 600, padding: '8px 0' }}>{items.length}</div>
          </div>
          <div style={{ gridColumn: 'span 3' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>NOTES</div>
            <input
              type="text"
              value={meta.notes}
              onChange={e => setMeta({ ...meta, notes: e.target.value })}
              placeholder="Requirement notes..."
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="card mb-20">
        <div className="section-title mb-16">📋 Required Products</div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name (Raw)</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Intelligence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <React.Fragment key={item.id}>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td className="editable-td">
                      <input type="text" value={item.raw_product_name || ''} onChange={e => updateItemField(i, 'raw_product_name', e.target.value)} />
                    </td>
                    <td className="editable-td" style={{ width: 100 }}>
                      <input type="number" value={item.quantity ?? ''} onChange={e => updateItemField(i, 'quantity', e.target.value)} />
                    </td>
                    <td className="editable-td" style={{ width: 100 }}>
                      <input type="text" value={item.unit || ''} onChange={e => updateItemField(i, 'unit', e.target.value)} />
                    </td>
                    <td>
                      {activeCompanyId ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setExpandedProduct(expandedProduct === item.id ? null : item.id)}
                        >
                          {expandedProduct === item.id ? '▲ Hide' : '🔍 View History'}
                        </button>
                      ) : <span className="text-muted" style={{ fontSize: 12 }}>Select company above to view</span>}
                    </td>
                  </tr>
                  {expandedProduct === item.id && activeCompanyId && (
                    <tr>
                      <td colSpan={5} style={{ padding: '8px 14px', background: 'var(--bg-elevated)' }}>
                        <HistoricalPanel
                          productName={item.raw_product_name}
                          companyId={activeCompanyId}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}
    </div>
  )
}
