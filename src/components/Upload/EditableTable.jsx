import { applyLineEdit, isMarginEditable } from '../../domain/pricing.js'
import { useOrgStore, canSeeCost } from '../../stores/orgStore.js'

export default function EditableTable({ rows, onChange, suppliers = [], mode = 'quotation', onMapItem, onShowHistory }) {
  const role = useOrgStore((s) => s.role)
  // Cost and margin columns exist only for owners and managers.
  const isQuotation = mode === 'quotation' 
  const showCost = isQuotation && canSeeCost(role)

  const handleMarginInput = (value) => {
    // Only allow numbers and one decimal point
    return value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
  }

  const updateCell = (i, field, value) => {
    onChange(rows.map((row, idx) => {
      if (idx !== i) return row
      // Requirement sheets carry no pricing, so only quotations recalculate.
      return isQuotation ? applyLineEdit(row, field, value) : { ...row, [field]: value }
    }))
  }

  const addRow = () => onChange([...rows, { raw_product_name: '', quantity: '', unit: '', rate: '', cost_price: '', quoted_price: '', margin: '', master_product_id: null, item_status: 'pending' }])
  const removeRow = i => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <>
      <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th style={{ width: 80, textAlign: 'center' }}>History</th>
            <th style={{ width: 30 }}>#</th>
            <th style={{ minWidth: 220 }}>Product & Mapping</th>
            <th style={{ width: 60 }}>Qty</th>
            <th style={{ width: 60 }}>Unit</th>
            {isQuotation && <th style={{ width: 120 }}>Supplier</th>}
            {showCost && <th className="stacked-header" style={{ width: 85 }}><div>Cost</div>Price</th>}
            {isQuotation && <th className="stacked-header" style={{ width: 85 }}><div>Quoted</div>Price</th>}
            {showCost && <th className="stacked-header" style={{ width: 75 }}><div>Margin</div>%</th>}
            {isQuotation && <th style={{ width: 130, textAlign: 'center' }}>Item Status</th>}
            <th style={{ width: 32 }}></th>
          </tr>
        </thead>
          <tbody>
            {rows.map((row, i) => {
              const hasMapping = !!row.master_product_id
              const isSaved = !!row.id

              return (
                <tr key={i}>
                  {/* History */}
                  {isQuotation && (
                    <td>
                      <button 
                        className="btn btn-ghost btn-xs btn-icon w-full" 
                        disabled={!isSaved}
                        title={!isSaved ? "Save to database first to view history" : "View price history"}
                        onClick={() => onShowHistory(i)}
                        style={{ opacity: isSaved ? 1 : 0.3, color: 'var(--primary-light)', background: 'var(--primary-bg)' }}
                      >
                        📈 History
                      </button>
                    </td>
                  )}
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  {/* Description */}
                  <td className="editable-td" style={{ minWidth: 220 }}>
                    <textarea 
                      className="td-input"
                      rows="1"
                      style={{ minHeight: 38, resize: 'none', marginBottom: 4, display: 'block' }}
                      value={row.raw_product_name || ''} 
                      onChange={e => updateCell(i, 'raw_product_name', e.target.value)} 
                      placeholder="Product description..." 
                    />
                    <button 
                      className={`btn btn-xs w-full ${hasMapping ? 'btn-success' : 'btn-secondary'}`}
                      style={{ height: 22, fontSize: 10, borderStyle: hasMapping ? 'solid' : 'dashed', opacity: 0.9 }}
                      onClick={() => onMapItem(i)}
                    >
                      {hasMapping ? `✓ ${row.master_product_name || 'Mapped'}` : '+ Map Product'}
                    </button>
                  </td>
                  {/* Qty */}
                  <td className="editable-td">
                    <input type="number" value={row.quantity || ''} onChange={e => updateCell(i, 'quantity', e.target.value)} placeholder="0" />
                  </td>
                  {/* Unit */}
                  <td className="editable-td">
                    <input value={row.unit || ''} onChange={e => updateCell(i, 'unit', e.target.value)} placeholder="pcs" />
                  </td>
                  {/* Supplier */}
                  {isQuotation && (
                    <td className="editable-td">
                      <select value={row.supplier_id || ''} onChange={e => updateCell(i, 'supplier_id', e.target.value)}>
                        <option value="">None</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                  )}
                  {/* Cost Price */}
                  {showCost && (
                    <td className="editable-td">
                      <input type="number" value={row.cost_price || ''} onChange={e => updateCell(i, 'cost_price', e.target.value)} placeholder="0.00" />
                    </td>
                  )}
                  {/* Quoted Price */}
                  {isQuotation && (
                    <td className="editable-td">
                      <input 
                        type="number" 
                        step="0.01"
                        value={row.quoted_price || row.rate || ''} 
                        onChange={e => updateCell(i, 'quoted_price', e.target.value)} 
                        placeholder="0.00" 
                        style={{ fontWeight: 600 }}
                      />
                    </td>
                  )}
                  {/* Margin */}
                  {showCost && (
                    <td className="editable-td">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.margin || ''}
                        onChange={e => updateCell(i, 'margin', handleMarginInput(e.target.value))}
                        placeholder={isMarginEditable(row) ? '%' : 'locked'}
                        disabled={!isMarginEditable(row)}
                        style={{
                          textAlign: 'right',
                          opacity: isMarginEditable(row) ? 1 : 0.35,
                          fontWeight: isMarginEditable(row) ? 700 : 400
                        }}
                      />
                    </td>
                  )}
                  {/* Item Status */}
                  {isQuotation && (
                    <td className="editable-td">
                      <select value={row.item_status || 'pending'} onChange={e => updateCell(i, 'item_status', e.target.value)} style={{ fontSize: 12, height: 28 }}>
                        <option value="pending">Pending</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                    </td>
                  )}
                  {/* Delete */}
                  <td>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => removeRow(i)} title="Remove row">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={addRow}>+ Add Row</button>
      </div>
    </>
  )
}
