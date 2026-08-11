import { useState, useEffect } from 'react'
import { getMasterProductHistory } from '../../db/queries'

export default function PriceHistoryModal({ masterProductId, rawProductName, companyId, masterProductName, onClose }) {
  const [history, setHistory] = useState({ sameCompany: [], otherCompanies: [], all: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (masterProductId || rawProductName) {
      getMasterProductHistory(masterProductId, rawProductName, companyId)
        .then(setHistory)
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [masterProductId, rawProductName, companyId])

  const formatCurrency = (val) => val ? `₹${parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'

  const HistoryTable = ({ items, showCompany = false }) => (
    <div className="table-wrapper" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ minWidth: 900 }}>
        <thead>
          <tr style={{ background: 'var(--bg-hover)' }}>
            <th style={smTH}>Date</th>
            {showCompany && <th style={smTH}>Company</th>}

            <th style={smTH}>Exact Name (Raw)</th>
            <th style={{ ...smTH, textAlign: 'center' }}>Qty</th>
            <th style={{ ...smTH, textAlign: 'right' }}>Unit Price</th>
            <th style={{ ...smTH, textAlign: 'right' }}>Total Cost</th>
            <th style={{ ...smTH, textAlign: 'right' }}>Total Margin</th>
            <th style={{ ...smTH, textAlign: 'right' }}>Margin %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h, i) => {
            const qty = parseFloat(h.quantity) || 0
            const cost = parseFloat(h.cost_price) || 0
            const quoted = parseFloat(h.quoted_price) || 0
            const marginPct = parseFloat(h.margin) || 0
            
            const totalCostVal = cost * qty
            const totalQuotedVal = quoted * qty
            const totalMarginVal = totalQuotedVal - totalCostVal

            return (
              <tr key={i}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{h.quotations?.date}</td>
                {showCompany && <td style={{ fontSize: 12, fontWeight: 600 }}>{h.quotations?.companies?.name}</td>}

                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.raw_product_name}</td>
                <td style={{ fontSize: 13, textAlign: 'center' }}>{h.quantity} {h.unit}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(quoted)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(totalCostVal)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: totalMarginVal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {formatCurrency(totalMarginVal)}
                </td>
                <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: marginPct >= 20 ? 'var(--success)' : 'var(--warning)' }}>
                  {marginPct ? `${marginPct}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1050, width: '95%', borderRadius: 16 }}>
        <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: 20 }}>
              Price History — {masterProductName || rawProductName}
            </h3>
            <div className="page-subtitle" style={{ marginTop: 4 }}>
              {masterProductId ? (
                <span style={{ color: 'var(--success)', fontWeight: 700 }}>● Broad Intelligence (Mapped Group)</span>
              ) : (
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>● Direct Intelligence (Exact Name Match)</span>
              )}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ borderRadius: '50%' }}>✕</button>
        </div>

        <div className="modal-content-scroll" style={{ maxHeight: 'calc(85vh - 100px)', overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div className="loading-overlay" style={{ height: 200, background: 'transparent' }}>
              <div className="spinner" /> <span style={{ marginLeft: 12 }}>Analyzing historical data...</span>
            </div>
          ) : (
            <div className="flex-col gap-32">
              <section>
                <div className="label-sm mb-12" style={{ color: 'var(--primary-light)', fontWeight: 800, letterSpacing: '0.1em' }}>HISTORICAL PURCHASES (THIS COMPANY)</div>
                {history.sameCompany.length > 0 ? (
                  <HistoryTable items={history.sameCompany} />
                ) : (
                  <div className="p-24 text-center" style={{ background: 'var(--bg-hover)', borderRadius: 12, color: 'var(--text-muted)' }}>
                    No past purchase history for this company.
                  </div>
                )}
              </section>

              <section>
                <div className="label-sm mb-12" style={{ color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.1em' }}>INTELLIGENCE FROM OTHER PROJECTS</div>
                {history.otherCompanies.length > 0 ? (
                  <HistoryTable items={history.otherCompanies} showCompany={true} />
                ) : (
                  <div className="p-24 text-center" style={{ background: 'var(--bg-hover)', borderRadius: 12, color: 'var(--text-muted)' }}>
                    No external pricing intelligence available.
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const smTH = {
  padding: '10px 12px',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)'
}
