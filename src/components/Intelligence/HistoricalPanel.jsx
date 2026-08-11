import { useState, useEffect } from 'react'
import { getMasterProductHistory } from '../../db/queries.js'

const rupee = n => n != null && n !== '' && !isNaN(n)
  ? `₹${parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : '—'

function calcStats(items) {
  const prices = items.map(i => i.quoted_price).filter(p => p != null && p > 0)
  if (!prices.length) return null
  const marginItems = items.filter(i => i.margin != null)
  return {
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avgMargin: marginItems.length > 0
      ? marginItems.reduce((s, i) => s + i.margin, 0) / marginItems.length : 0,
  }
}

const TH = {
  padding: '5px 8px',
  textAlign: 'left', color: 'var(--text-muted)',
  fontWeight: 600, fontSize: 10,
  letterSpacing: '0.05em', textTransform: 'uppercase',
}

export default function HistoricalPanel({ productName, companyId }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!productName || !companyId) { setLoading(false); return }
    setLoading(true)
    // No master-product id here — match on the exact raw name instead.
    getMasterProductHistory(null, productName, companyId)
      .then(setData).catch(console.error).finally(() => setLoading(false))
  }, [productName, companyId])

  if (loading) return (
    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 16px' }}>
      Loading history for <em>{productName}</em>…
    </div>
  )
  if (!data) return null

  const sameStats  = calcStats(data.sameCompany)
  const otherStats = calcStats(data.otherCompanies)

  // win rate for this company
  const closed  = data.sameCompany.filter(q => ['won', 'lost'].includes(q.quotations?.status))
  const won     = closed.filter(q => q.quotations?.status === 'won')
  const winRate = closed.length > 0 ? (won.length / closed.length * 100) : null

  return (
    <div className="intelligence-panel">
      <div className="intel-header">
        📊 History — {productName}
        {winRate !== null && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: winRate >= 50 ? 'var(--success)' : 'var(--warning)' }}>
            🏆 {winRate.toFixed(0)}% win rate
          </span>
        )}
      </div>

      {/* ── Section A: This company ──────────────────────────────────────────── */}
      <div className="intel-section">
        <div className="intel-section-title">
          This Company — {data.sameCompany.length} quote{data.sameCompany.length !== 1 ? 's' : ''}
        </div>

        {data.sameCompany.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No previous quotes to this company for this product.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Date', 'Quoted', 'Cost', 'Margin', 'Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: h === 'Quoted' || h === 'Cost' || h === 'Margin' ? 'right' : h === 'Status' ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sameCompany.slice(0, 6).map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>{item.quotations?.date || '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{rupee(item.quoted_price)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{rupee(item.cost_price)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    <span className={item.margin >= 20 ? 'text-success' : 'text-warning'}>
                      {item.margin != null ? `${item.margin.toFixed(1)}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <span className={`badge badge-${item.quotations?.status}`}>{item.quotations?.status || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {sameStats && (
          <div className="price-chips mt-12">
            <div className="price-chip">Avg <strong>{rupee(sameStats.avg)}</strong></div>
            <div className="price-chip">Min <strong>{rupee(sameStats.min)}</strong></div>
            <div className="price-chip">Max <strong>{rupee(sameStats.max)}</strong></div>
            <div className="price-chip">Avg Margin <strong>{sameStats.avgMargin.toFixed(1)}%</strong></div>
          </div>
        )}
      </div>

      {/* ── Section B: Market ───────────────────────────────────────────────── */}
      <div className="intel-section">
        <div className="intel-section-title">
          Market — {data.otherCompanies.length} quote{data.otherCompanies.length !== 1 ? 's' : ''} from other companies
        </div>

        {data.otherCompanies.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No market data for this product yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Company', 'Date', 'Price', 'Margin', 'Status'].map(h => (
                  <th key={h} style={{ ...TH, textAlign: h === 'Price' || h === 'Margin' ? 'right' : h === 'Status' ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.otherCompanies.slice(0, 6).map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 500, fontSize: 11 }}>{item.quotations?.companies?.name || '—'}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: 11 }}>{item.quotations?.date || '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{rupee(item.quoted_price)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                    <span className={item.margin >= 20 ? 'text-success' : 'text-warning'}>
                      {item.margin != null ? `${item.margin.toFixed(1)}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <span className={`badge badge-${item.quotations?.status}`}>{item.quotations?.status || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {otherStats && (
          <div className="price-chips mt-12">
            <div className="price-chip">Market Avg <strong>{rupee(otherStats.avg)}</strong></div>
            <div className="price-chip">Min <strong>{rupee(otherStats.min)}</strong></div>
            <div className="price-chip">Max <strong>{rupee(otherStats.max)}</strong></div>
          </div>
        )}
      </div>
    </div>
  )
}
