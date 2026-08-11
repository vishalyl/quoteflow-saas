import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardData } from '../db/queries.js'
import { useOrgStore, canSeeCost } from '../stores/orgStore.js'
import {
  SupplierWinLossChart, CompanyWinLossChart,
  CompanySpotlight, SupplierSpotlight, MonthlyWinRateChart,
} from '../components/Charts/Charts.jsx'

function formatINR(val) {
  const n = Number(val) || 0
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const DISMISSED_KEY = 'qf_dismissed_alerts'

function loadDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function KpiCard({ label, value, sub, color, icon, onClick, smallValue }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`kpi-card ${color}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', textAlign: 'left', font: 'inherit', border: 0, width: '100%' } : {}}
    >
      <div className="kpi-label">{icon} {label}</div>
      <div
        className="kpi-value"
        style={{
          color: color === 'primary' ? 'var(--primary-light)'
            : color === 'success' ? 'var(--success)'
            : color === 'warning' ? 'var(--warning)' : 'var(--accent-light)',
          fontSize: smallValue ? '20px' : undefined,
        }}
      >
        {value}
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </Tag>
  )
}

function AlertModal({ title, emptyText, rows, dismissed, onDismiss, onClose }) {
  const visible = rows.filter(r => !dismissed.has(r.id))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3 className="section-title">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {visible.length === 0 ? (
            <div className="p-32 text-center text-muted">{emptyText}</div>
          ) : (
            <div className="flex-col gap-8">
              {visible.map(row => (
                <div
                  key={row.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--bg-hover)', borderRadius: 10, border: '1px solid var(--border)' }}
                >
                  <Link to={`/quotations/${row.id}`} onClick={onClose} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontWeight: 600 }}>{row.company_name || 'No company'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {row.date} · {row.days_old} days old · {formatINR(row.value)}
                    </div>
                  </Link>
                  <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)', fontSize: 11 }} onClick={() => onDismiss(row.id)}>
                    Dismiss
                  </button>
                  <Link to={`/quotations/${row.id}`} onClick={onClose} className="btn btn-secondary btn-xs">Edit →</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RankingModal({ title, rows, nameKey, valueKey, metricLabel, onClose }) {
  const maxVal = Number(rows[0]?.[valueKey]) || 1
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3 className="section-title">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }} className="flex-col gap-12">
          {rows.length === 0 && <div className="p-32 text-center text-muted">Nothing to rank yet</div>}
          {rows.map((row, idx) => (
            <div key={idx} style={{ position: 'relative', padding: '14px 18px', borderRadius: 12, background: 'var(--bg-hover)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(Number(row[valueKey]) / maxVal) * 100}%`, background: 'var(--primary)', opacity: 0.05 }} />
              <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', opacity: 0.4 }}>#{idx + 1}</span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{row[nameKey]}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{formatINR(row[valueKey])}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{metricLabel}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [modal, setModal] = useState(null) // 'incomplete' | 'stale' | 'clients' | 'suppliers'

  const role = useOrgStore((s) => s.role)
  const showMargins = canSeeCost(role)

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const dismiss = (id) => {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading dashboard…</span></div>
  if (error) return <div className="empty-state"><span className="empty-icon">⚠️</span><p>{error}</p></div>
  if (!data) return <div className="empty-state"><span className="empty-icon">📊</span><p>No data available</p></div>

  const topClient = data.clientRanking[0]
  const topSupplier = data.supplierRanking[0]
  const openIncomplete = data.incomplete.filter(r => !dismissed.has(r.id)).length
  const openStale = data.staleFollowups.filter(r => !dismissed.has(r.id)).length

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Business overview</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <KpiCard label="Open pipeline" value={formatINR(data.pipeline)} sub={`${data.pending || 0} pending quotes`} color="primary" icon="💰" />
        <KpiCard
          label="Top target client"
          value={topClient ? topClient.company_name : 'None'}
          sub={topClient ? `${formatINR(topClient.pipeline)} pending` : 'No open pipeline'}
          color="success" icon="🎯" smallValue
          onClick={() => setModal('clients')}
        />
        <KpiCard
          label="Top supplier"
          value={topSupplier ? topSupplier.supplier_name : 'None'}
          sub={topSupplier ? `${formatINR(topSupplier.won_revenue)} won` : 'No won revenue'}
          color="primary" icon="🚚" smallValue
          onClick={() => setModal('suppliers')}
        />
        <KpiCard label="Incomplete data" value={openIncomplete} sub="missing prices" color="accent" icon="⚠️" onClick={() => setModal('incomplete')} />
        <KpiCard label="Pending follow-ups" value={openStale} sub="3+ days awaiting" color="warning" icon="⏰" onClick={() => setModal('stale')} />
        <KpiCard label="Win rate" value={`${data.win_rate ?? 0}%`} sub={`${data.won || 0} won of ${data.total || 0}`} color="success" icon="🏆" />
        {showMargins && (
          <KpiCard label="Avg margin" value={`${data.avg_margin ?? 0}%`} sub="across all line items" color="success" icon="📈" />
        )}
      </div>

      {modal === 'incomplete' && (
        <AlertModal
          title="Incomplete quotations (missing prices)"
          emptyText="All clear — every pending quote has prices."
          rows={data.incomplete} dismissed={dismissed} onDismiss={dismiss} onClose={() => setModal(null)}
        />
      )}
      {modal === 'stale' && (
        <AlertModal
          title="Pending follow-ups"
          emptyText="Nothing is going cold."
          rows={data.staleFollowups} dismissed={dismissed} onDismiss={dismiss} onClose={() => setModal(null)}
        />
      )}
      {modal === 'clients' && (
        <RankingModal
          title="Client pipeline ranking" rows={data.clientRanking}
          nameKey="company_name" valueKey="pipeline" metricLabel="Pending pipeline"
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'suppliers' && (
        <RankingModal
          title="Supplier performance ranking" rows={data.supplierRanking}
          nameKey="supplier_name" valueKey="won_revenue" metricLabel="Won revenue"
          onClose={() => setModal(null)}
        />
      )}

      <div className="charts-grid">
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-title">🏢 Client spotlight</div>
          <CompanySpotlight companies={data.clientRanking} />
        </div>
        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-title">🚚 Supplier spotlight</div>
          <SupplierSpotlight suppliers={data.supplierRanking} />
        </div>
        <div className="chart-card">
          <div className="chart-title">🚚 Win vs loss by supplier</div>
          <SupplierWinLossChart rows={data.supplierWinLoss} />
        </div>
        <div className="chart-card">
          <div className="chart-title">🏢 Win vs loss by client</div>
          <CompanyWinLossChart rows={data.companyWinLoss} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginTop: 24 }}>
        <div className="card">
          <div className="section-title mb-16" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>⭐️</span> Top performing products
          </div>
          <div className="flex-col gap-12">
            {data.topProducts.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>Nothing won yet.</div>}
            {data.topProducts.map((product, idx) => {
              const max = Number(data.topProducts[0]?.won_revenue) || 1
              return (
                <div key={idx} style={{ position: 'relative', padding: '12px 14px', borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(Number(product.won_revenue) / max) * 100}%`, background: 'var(--primary)', opacity: 0.05 }} />
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', opacity: 0.5, width: 18 }}>{idx + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.product_name}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{formatINR(product.won_revenue)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {showMargins && product.avg_margin != null ? `${product.avg_margin}% margin` : `${product.times_quoted} quotes`}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-title mb-16" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📈</span> Win rate trend
          </div>
          <div style={{ height: 240, padding: '0 10px' }}>
            <MonthlyWinRateChart rows={data.trend} />
          </div>
        </div>
      </div>
    </div>
  )
}
