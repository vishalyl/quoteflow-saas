import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FileUploader from '../components/Upload/FileUploader.jsx'
import EditableTable from '../components/Upload/EditableTable.jsx'
import CompanySelect from '../components/Forms/CompanySelect.jsx'
import PreviewPanel from '../components/Forms/PreviewPanel.jsx'
import { createRequirement } from '../db/queries.js'

export default function RequirementUpload() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState([])
  const [company, setCompany] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleOcrComplete = (parsedRows) => {
    setRows(parsedRows)
    setStep(2)
  }

  const handleSave = async () => {
    const validRows = rows.filter(r => r.raw_product_name?.trim())
    if (!validRows.length) { showToast('Add at least one product', 'error'); return }
    setSaving(true)
    try {
      await createRequirement(company?.id || null, date, notes || null, validRows)
      showToast('Requirement saved!')
      setTimeout(() => navigate('/requirements'), 800)
    } catch (err) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const steps = [
    { n: 1, label: 'Upload Image' },
    { n: 2, label: 'Edit Table' },
    { n: 3, label: 'Company & Meta' },
    { n: 4, label: 'Preview & Save' },
  ]

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-header">
        <div>
          <div className="page-title">New Requirement</div>
          <div className="page-subtitle">Upload a screenshot to extract product data via OCR</div>
        </div>
      </div>

      <div className="step-indicator">
        {steps.map((s, i) => (
          <>
            {i > 0 && <span key={`a${i}`} style={{ color: 'var(--border)', fontSize: 14 }}>›</span>}
            <div key={s.n} className={`step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}`}>
              <span className="step-num">{step > s.n ? '✓' : s.n}</span>
              {s.label}
            </div>
          </>
        ))}
      </div>

      {/* Step 1: Upload */}
      <div className="card mb-20">
        <div className="section-header">
          <div className="section-title">📷 Step 1 — Upload Image</div>
          {step > 1 && <span className="badge badge-won">✓ Done</span>}
        </div>
        <FileUploader onComplete={handleOcrComplete} />
        {step === 1 && rows.length === 0 && (
          <div className="mt-12">
            <button className="btn btn-secondary btn-sm" onClick={() => { setRows([{ raw_product_name: '', quantity: '', unit: '' }]); setStep(2) }}>
              Skip OCR — Add rows manually
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Edit Table */}
      {step >= 2 && (
        <div className="card mb-20 fade-in">
          <div className="section-header">
            <div className="section-title">✏️ Step 2 — Review & Edit Extracted Data</div>
            <button className="btn btn-primary btn-sm" onClick={() => setStep(3)}>Looks good →</button>
          </div>
          <EditableTable rows={rows} onChange={setRows} mode="requirement" />
        </div>
      )}

      {/* Step 3: Company & Meta */}
      {step >= 3 && (
        <div className="card mb-20 fade-in">
          <div className="section-title mb-16">🏢 Step 3 — Select Company & Details</div>
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Company (Client)</label>
              <CompanySelect value={company} onChange={c => { setCompany(c); setStep(4) }} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." />
            </div>
          </div>
          {!company && (
            <button className="btn btn-secondary btn-sm mt-12" onClick={() => setStep(4)}>
              Skip company → Continue
            </button>
          )}
        </div>
      )}

      {/* Step 4: Preview & Save */}
      {step >= 4 && (
        <div className="fade-in">
          <div className="mb-20">
            <div className="section-title mb-12">👁️ Step 4 — Preview & Save</div>
            <PreviewPanel company={company} rows={rows} date={date} onDateChange={setDate} />
          </div>
          <button className="btn btn-primary btn-lg w-full" onClick={handleSave} disabled={saving}>
            {saving ? <><div className="spinner" /> Saving...</> : '💾 Save Requirement'}
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}
