export default function PreviewPanel({ company, rows, date, onDateChange }) {
  const totalItems = rows.filter(r => r.raw_product_name).length
  const totalQty = rows.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0)
  const totalValue = rows.reduce((s, r) => s + ((parseFloat(r.quoted_price) || parseFloat(r.rate) || 0) * (parseFloat(r.quantity) || 1)), 0)

  return (
    <div className="preview-panel">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--primary-light)' }}>📋 Summary Preview</div>
      <div className="preview-item">
        <span className="preview-label">Company</span>
        <span className="preview-value">{company?.name || <span className="text-muted">Not selected</span>}</span>
      </div>
      <div className="preview-item">
        <span className="preview-label">Date</span>
        <input
          type="date"
          value={date}
          onChange={e => onDateChange(e.target.value)}
          style={{ width: 'auto', padding: '3px 8px', fontSize: 13 }}
        />
      </div>
      <div className="preview-item">
        <span className="preview-label">Total Items</span>
        <span className="preview-value">{totalItems}</span>
      </div>
      <div className="preview-item">
        <span className="preview-label">Total Quantity</span>
        <span className="preview-value">{totalQty.toLocaleString()}</span>
      </div>
      {totalValue > 0 && (
        <div className="preview-item">
          <span className="preview-label">Quoted Value</span>
          <span className="preview-value" style={{ color: 'var(--success)' }}>₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      )}
    </div>
  )
}
