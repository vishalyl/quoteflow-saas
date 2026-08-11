import { useEffect, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { getSupplierSpotlight, getCompanySpotlight } from '../../db/queries.js'

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
)

/**
 * Every chart here is fed pre-aggregated rows from SQL.
 *
 * They used to receive the entire quotations and quotation_items tables and
 * aggregate in the browser — which broke silently once an account had more
 * than 1,000 rows, because the fetch was truncated and nothing said so. Eight
 * further chart components in this file were never rendered anywhere and have
 * been removed.
 */

const GRID = 'rgba(148,163,184,0.12)'
const TICK = '#94a3b8'

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: TICK, boxWidth: 12, font: { size: 11 } } },
    tooltip: { intersect: false, mode: 'index' },
  },
  scales: {
    x: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 10 } } },
    y: { grid: { color: GRID }, ticks: { color: TICK, font: { size: 10 } }, beginAtZero: true },
  },
}

function formatINR(val) {
  const n = Number(val) || 0
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function monthLabel(key) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function EmptyChart({ children }) {
  return (
    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, fontSize: 13 }}>
      {children}
    </div>
  )
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-hover)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

/** Won / lost / pending per client. Rows come from company_win_loss(). */
export function CompanyWinLossChart({ rows = [] }) {
  if (rows.length === 0) return <EmptyChart>No quotations yet</EmptyChart>

  return (
    <div style={{ height: 260 }}>
      <Bar
        options={{ ...baseOptions, scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, stacked: true }, y: { ...baseOptions.scales.y, stacked: true } } }}
        data={{
          labels: rows.map(r => r.company_name),
          datasets: [
            { label: 'Won', data: rows.map(r => Number(r.won) + Number(r.partial_win)), backgroundColor: '#10b981' },
            { label: 'Lost', data: rows.map(r => Number(r.lost)), backgroundColor: '#ef4444' },
            { label: 'Pending', data: rows.map(r => Number(r.pending)), backgroundColor: '#f59e0b' },
          ],
        }}
      />
    </div>
  )
}

/** Won / lost / pending per supplier. Rows come from supplier_win_loss(). */
export function SupplierWinLossChart({ rows = [] }) {
  if (rows.length === 0) return <EmptyChart>No supplier data yet</EmptyChart>

  return (
    <div style={{ height: 260 }}>
      <Bar
        options={{ ...baseOptions, scales: { ...baseOptions.scales, x: { ...baseOptions.scales.x, stacked: true }, y: { ...baseOptions.scales.y, stacked: true } } }}
        data={{
          labels: rows.map(r => r.supplier_name),
          datasets: [
            { label: 'Won', data: rows.map(r => Number(r.won) + Number(r.partial_win)), backgroundColor: '#10b981' },
            { label: 'Lost', data: rows.map(r => Number(r.lost)), backgroundColor: '#ef4444' },
            { label: 'Pending', data: rows.map(r => Number(r.pending)), backgroundColor: '#f59e0b' },
          ],
        }}
      />
    </div>
  )
}

/** Monthly win-rate trend. Rows come from monthly_win_rate(). */
export function MonthlyWinRateChart({ rows = [] }) {
  if (rows.length === 0) return <EmptyChart>Not enough history yet</EmptyChart>

  return (
    <Line
      options={{
        ...baseOptions,
        plugins: { ...baseOptions.plugins, legend: { display: false } },
        scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, max: 100, ticks: { ...baseOptions.scales.y.ticks, callback: v => `${v}%` } } },
      }}
      data={{
        labels: rows.map(r => monthLabel(r.month)),
        datasets: [{
          data: rows.map(r => Number(r.win_rate)),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 5,
        }],
      }}
    />
  )
}

/**
 * One supplier's performance, or all of them.
 * Fetches its own aggregate when the selection changes.
 */
export function SupplierSpotlight({ suppliers = [] }) {
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getSupplierSpotlight(selectedId || null)
      .then(result => { if (!cancelled) setData(result) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  const marginRows = data?.margin_by_month ?? []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🚚</span>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ flex: 1, fontWeight: 600, fontSize: 14 }}
          >
            <option value="">All suppliers</option>
            {suppliers.map(s => (
              <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <EmptyChart>Loading…</EmptyChart>
        ) : !data ? (
          <EmptyChart>No supplier data yet</EmptyChart>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <StatBox label="Win rate" value={`${data.win_rate ?? 0}%`} color="var(--success)" />
              <StatBox label="Avg margin" value={`${data.avg_margin ?? 0}%`} />
              <StatBox label="Avg cost" value={formatINR(data.avg_cost)} />
              <StatBox label="Won / lost" value={`${data.won ?? 0} / ${data.lost ?? 0}`} sub={`${data.partial ?? 0} partial`} />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Recent items
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(data.recent ?? []).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.raw_product_name}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatINR(item.quoted_price)}</span>
                  </div>
                ))}
                {(data.recent ?? []).length === 0 && <EmptyChart>Nothing quoted yet</EmptyChart>}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ height: 260 }}>
        {marginRows.length > 0 ? (
          <Line
            options={{ ...baseOptions, plugins: { ...baseOptions.plugins, legend: { display: false } } }}
            data={{
              labels: marginRows.map(r => monthLabel(r.month)),
              datasets: [{
                label: 'Avg margin %',
                data: marginRows.map(r => Number(r.avg_margin)),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.15)',
                fill: true,
                tension: 0.35,
              }],
            }}
          />
        ) : <EmptyChart>No margin history yet</EmptyChart>}
      </div>
    </div>
  )
}

/** One client's performance, or all of them. */
export function CompanySpotlight({ companies = [] }) {
  const [selectedId, setSelectedId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCompanySpotlight(selectedId || null)
      .then(result => { if (!cancelled) setData(result) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  const revenueRows = data?.revenue_by_month ?? []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🏢</span>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ flex: 1, fontWeight: 600, fontSize: 14 }}
          >
            <option value="">All clients</option>
            {companies.map(c => (
              <option key={c.company_id} value={c.company_id}>{c.company_name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <EmptyChart>Loading…</EmptyChart>
        ) : !data ? (
          <EmptyChart>No client data yet</EmptyChart>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <StatBox label="Win rate" value={`${data.win_rate ?? 0}%`} color="var(--success)" />
            <StatBox label="Avg margin" value={`${data.avg_margin ?? 0}%`} />
            <StatBox label="Won revenue" value={formatINR(data.revenue)} color="var(--success)" />
            <StatBox label="Open pipeline" value={formatINR(data.pipeline)} color="var(--warning)" />
          </div>
        )}
      </div>

      <div style={{ height: 260 }}>
        {revenueRows.length > 0 ? (
          <Bar
            options={{
              ...baseOptions,
              plugins: { ...baseOptions.plugins, legend: { display: false } },
              scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: v => formatINR(v) } } },
            }}
            data={{
              labels: revenueRows.map(r => monthLabel(r.month)),
              datasets: [{
                label: 'Won revenue',
                data: revenueRows.map(r => Number(r.revenue)),
                backgroundColor: '#6366f1',
                borderRadius: 4,
              }],
            }}
          />
        ) : <EmptyChart>No won revenue yet</EmptyChart>}
      </div>
    </div>
  )
}
