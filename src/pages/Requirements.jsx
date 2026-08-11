import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRequirements } from '../db/queries.js'

export default function Requirements() {
  const [reqs, setReqs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRequirements().then(setReqs).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Requirements</div>
          <div className="page-subtitle">{reqs.length} total requirements</div>
        </div>
        <Link to="/requirements/new" className="btn btn-primary">+ New Requirement</Link>
      </div>

      {reqs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📋</span>
          <p>No requirements yet</p>
          <Link to="/requirements/new" className="btn btn-primary mt-16">Upload First Requirement</Link>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Company</th>
                <th>Items</th>
                <th>Notes</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reqs.map(req => (
                <tr key={req.id}>
                  <td>{req.date}</td>
                  <td>{req.companies?.name || <span className="text-muted">—</span>}</td>
                  <td>{req.requirement_items?.length ?? 0} items</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.notes || '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{new Date(req.created_at).toLocaleDateString('en-IN')}</td>
                  <td><Link to={`/requirements/${req.id}`} className="btn btn-ghost btn-sm">View →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
