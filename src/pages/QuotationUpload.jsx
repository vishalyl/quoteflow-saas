import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/Upload/FileUploader.jsx'
import EditableTable from '../components/Upload/EditableTable.jsx'
import CompanySelect from '../components/Forms/CompanySelect.jsx'
import PreviewPanel from '../components/Forms/PreviewPanel.jsx'
import { saveQuotation, getSuppliers, getQuotationById } from '../db/queries.js'
import ProductMappingModal from '../components/Modals/ProductMappingModal.jsx'
import PriceHistoryModal from '../components/Modals/PriceHistoryModal.jsx'
import ClientViewModal from '../components/Modals/ClientViewModal.jsx'
import { deriveQuotationStatus } from '../utils/statusUtils.js'
import { useQuotationDraft } from '../stores/quotationDraftStore.js'

export default function QuotationUpload() {
  const navigate = useNavigate()
  const draft = useQuotationDraft()
  const [suppliers, setSuppliers] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  // Modals
  const [mappingIndex, setMappingIndex] = useState(null)
  const [historyIndex, setHistoryIndex] = useState(null)
  const [showClientView, setShowClientView] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(console.error)
  }, [])

  const handleOcrComplete = (parsedRows) => {
    draft.setRows(parsedRows.map(r => ({
      ...r,
      cost_price: '',
      quoted_price: r.rate || '',
      margin: '',
      supplier_id: '',
      master_product_id: null,
      master_product_name: null,
      item_status: 'pending'
    })))
    draft.setStep(3)
  }

  const performSave = async (silent = false) => {
    const validRows = draft.rows.filter(r => r.raw_product_name?.trim())
    if (!validRows.length) { 
      if (!silent) showToast('Add at least one product', 'error')
      return null 
    }

    setSaving(true)
    try {
      const derivedStatus = deriveQuotationStatus(validRows)
      const payload = { 
        company_id: draft.company?.id || null, 
        date: draft.date, 
        status: derivedStatus, 
        notes: draft.notes || null 
      }

      const wasExisting = Boolean(draft.quotationId)
      // Creates or updates in a single transaction; line item ids survive.
      const quotationId = await saveQuotation(draft.quotationId, payload, validRows)
      if (!wasExisting) draft.setQuotationId(quotationId)

      // Refresh rows so newly created items carry their real database ids.
      const fullQ = await getQuotationById(quotationId)
      draft.setRows(fullQ.quotation_items.map(item => ({
        ...item,
        master_product_name: item.master_products?.name
      })))

      if (!silent) showToast(wasExisting ? 'Quotation Updated!' : 'Saved to Database!')
      return quotationId
    } catch (err) {
      if (!silent) showToast(err.message || 'Save failed', 'error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSaveToMaster = () => performSave()


  const handleMappingComplete = (mp) => {
    const updated = [...draft.rows]
    updated[mappingIndex] = {
      ...updated[mappingIndex],
      master_product_id: mp.id,
      master_product_name: mp.name
    }
    draft.setRows(updated)
    setMappingIndex(null)
  }

  const steps = [
    { n: 1, label: 'Upload' },
    { n: 2, label: 'Details' },
    { n: 3, label: 'Mapping & Items' },
    { n: 4, label: 'Preview' },
  ]

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <div className="page-title">New Quotation</div>
          <div className="page-subtitle">Photograph a requirement sheet, or enter items by hand</div>
        </div>
      </div>

      <div className="step-indicator">
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            {i > 0 && <span style={{ color: 'var(--border)', fontSize: 14, margin: '0 8px' }}>›</span>}
            <div className={`step ${draft.step === s.n ? 'active' : draft.step > s.n ? 'done' : ''}`}>
              <span className="step-num">{draft.step > s.n ? '✓' : s.n}</span>
              {s.label}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Section 1: Upload */}
      <div className="card mb-24 fade-in">
        <div className="section-header">
          <div className="section-title">📷 1. Upload Requirements</div>
        </div>
        <FileUploader onComplete={handleOcrComplete} />
        <div className="mt-16">
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (draft.rows.length === 0) draft.setRows([{ raw_product_name: '', quantity: '', unit: '', cost_price: '', quoted_price: '', margin: '', master_product_id: null }])
            if (draft.step < 2) draft.setStep(2)
          }}>
            Manual Entry / Skip Upload →
          </button>
        </div>
      </div>

      {/* Section 2: Company Details */}
      {draft.step >= 2 && (
        <div className="card mb-24 fade-in">
          <div className="section-header">
            <div className="section-title">🏢 2. Company & Date Details</div>
          </div>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Company (Client)</label>
              <CompanySelect value={draft.company} onChange={draft.setCompany} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={draft.date} onChange={e => draft.setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Derived Status & Bulk Actions</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <span className={`badge badge-${deriveQuotationStatus(draft.rows)}`} style={{ fontSize: 13, padding: '4px 12px' }}>
                  {deriveQuotationStatus(draft.rows)}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>|</span>
                <select 
                  className="btn btn-ghost btn-xs" 
                  style={{ width: 'auto', padding: '2px 8px', height: 28, fontSize: 13, border: '1px solid var(--border)' }}
                  onChange={e => {
                    const s = e.target.value;
                    if (!s) return;
                    draft.setRows(draft.rows.map(r => ({ ...r, item_status: s })));
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
          </div>
          {draft.step === 2 && (
            <button className="btn btn-primary mt-20" onClick={() => draft.setStep(3)}>
              Continue to Item Mapping →
            </button>
          )}
        </div>
      )}

      {/* Section 3: Item Table & Database Saving */}
      {draft.step >= 3 && (
        <div className="card mb-24 fade-in">
          <div className="section-header">
            <div className="section-title">✏️ 3. Item List & Mapping</div>
            {draft.quotationId && <span className="badge badge-won">✓ Saved to Database</span>}
          </div>
          <div className="mb-16" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Map items to master products for grouped historical intelligence.
          </div>
          <EditableTable
            rows={draft.rows}
            onChange={draft.setRows}
            suppliers={suppliers}
            onMapItem={setMappingIndex}
            onShowHistory={setHistoryIndex}
          />

          <div className="flex justify-end gap-12 mt-24">
            <button className="btn btn-success" onClick={handleSaveToMaster} disabled={saving}>
              {saving ? 'Saving...' : '💾 Save to Master Database'}
            </button>
            {draft.step < 4 && (
              <button className="btn btn-primary" onClick={() => draft.setStep(4)}>
                Next: Final Preview →
              </button>
            )}
            {draft.step >= 4 && <span className="badge badge-accepted">✓ Preview Generated</span>}
          </div>
        </div>
      )}

      {/* Section 4: Preview & Profitability */}
      {draft.step >= 4 && (
        <div className="fade-in mb-40">
          <div className="mb-20">
            <div className="section-title mb-12">👁️ 4. Final Quotation Preview</div>
            <PreviewPanel company={draft.company} rows={draft.rows} date={draft.date} onDateChange={draft.setDate} />

            <div className="card mt-20" style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-light)' }}>
              <div className="flex justify-between items-center">
                <div>
                  <div className="label-sm">Order Profitability</div>
                  <div className="kpi-value" style={{ fontSize: 24, marginBottom: 0, color: 'var(--primary)' }}>
                    ₹{draft.rows.reduce((sum, r) => sum + ((parseFloat(r.quoted_price || 0) - parseFloat(r.cost_price || 0)) * parseFloat(r.quantity || 0)), 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="label-sm">Avg. Margin</div>
                  <div className="kpi-value" style={{ fontSize: 24, marginBottom: 0, color: 'var(--success)' }}>
                    {(draft.rows.reduce((sum, r) => sum + parseFloat(r.margin || 0), 0) / (draft.rows.filter(r => r.margin).length || 1)).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-24" style={{ textAlign: 'center' }}>
            <h4 style={{ marginBottom: 12 }}>Ready to finalize?</h4>
            <div className="flex gap-12 justify-center">
              <button className="btn btn-secondary" onClick={() => setShowClientView(true)}>
                📄 Client View
              </button>
              <button className="btn btn-primary btn-lg px-40" disabled={saving} onClick={async () => {
                const savedId = await performSave(true)
                if (savedId || draft.quotationId) {
                  draft.clearDraft()
                  navigate('/quotations')
                } else {
                  showToast('Failed to save quotation. Please check your data.', 'error')
                }
              }}>
                {saving ? 'Saving...' : 'Save to Quotation Database'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mappingIndex !== null && (
        <ProductMappingModal
          rawName={draft.rows[mappingIndex].raw_product_name}
          onMappingComplete={handleMappingComplete}
          onClose={() => setMappingIndex(null)}
        />
      )}

      {historyIndex !== null && (
        <PriceHistoryModal
          masterProductId={draft.rows[historyIndex].master_product_id}
          masterProductName={draft.rows[historyIndex].master_product_name}
          rawProductName={draft.rows[historyIndex].raw_product_name}
          companyId={draft.company?.id}
          onClose={() => setHistoryIndex(null)}
        />
      )}

      {showClientView && (
        <ClientViewModal
          companyName={draft.company?.name}
          rows={draft.rows}
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
