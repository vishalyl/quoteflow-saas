import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getQuotations } from '../db/queries.js'

export default function Quotations() {
  const [quots, setQuots] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date') // 'date' | 'company'
  const [sortDir, setSortDir] = useState('desc') // 'asc' | 'desc'

  useEffect(() => {
    getQuotations().then(setQuots).catch(console.error).finally(() => setLoading(false))
  }, [])

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const sorted = useMemo(() => {
    const statusFiltered = filter === 'all' ? quots : quots.filter(q => q.status === filter)
    return [...statusFiltered].sort((a, b) => {
      let valA, valB
      if (sortBy === 'date') {
        valA = a.date || ''
        valB = b.date || ''
      } else {
        valA = (a.companies?.name || '').toLowerCase()
        valB = (b.companies?.name || '').toLowerCase()
      }
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [quots, filter, sortBy, sortDir])

  const SortIcon = ({ col }) => {
    if (sortBy !== col) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span style={{ color: 'var(--primary-light)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Quotations</div>
          <div className="page-subtitle">{quots.length} total quotations</div>
        </div>
        <div className="flex gap-8 items-center flex-wrap">
          {['all', 'won', 'partial_win', 'lost', 'pending'].map(s => (
            <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : <span className={`badge badge-${s}`}>{s === 'won' ? 'Won' : s === 'partial_win' ? 'Partial Win' : s === 'lost' ? 'Lost' : 'Pending'}</span>}
            </button>
          ))}
          <Link to="/quotations/new" className="btn btn-primary">+ New Quotation</Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📄</span>
          <p>{filter === 'all' ? 'No quotations yet' : `No ${filter} quotations`}</p>
          {filter === 'all' && <Link to="/quotations/new" className="btn btn-primary mt-16">Upload First Quotation</Link>}
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort('date')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Date <SortIcon col="date" />
                </th>
                <th onClick={() => toggleSort('company')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  Company <SortIcon col="company" />
                </th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(q => (
                <tr key={q.id}>
                  <td>{q.date}</td>
                  <td>{q.companies?.name || <span className="text-muted">—</span>}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{q.supplier || '—'}</td>
                  <td>{q.quotation_items?.length ?? 0} items</td>
                  <td><span className={`badge badge-${q.status}`}>{q.status}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(q.created_at).toLocaleDateString('en-IN')}</td>
                  <td><Link to={`/quotations/${q.id}`} className="btn btn-ghost btn-sm">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
