import { useState, useEffect, useRef } from 'react'
import { getCompanies, addCompany } from '../../db/queries.js'

export default function CompanySelect({ value, onChange }) {
  const [companies, setCompanies] = useState([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    getCompanies().then(data => {
      // Deduplicate by name (case-insensitive) to hide double-seeded DB entries
      const unique = []
      const seen = new Set()
      for (const c of data) {
        const key = c.name.toLowerCase().trim()
        if (!seen.has(key)) { seen.add(key); unique.push(c) }
      }
      setCompanies(unique)
    }).catch(console.error)
  }, [])

  useEffect(() => {
    const handler = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const select = company => {
    onChange(company)
    setSearch(company.name)
    setOpen(false)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const c = await addCompany(newName.trim())
      setCompanies(prev => [...prev, c])
      select(c)
      setNewName('')
    } catch (err) {
      console.error(err)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="company-select-wrapper" ref={wrapRef}>
      <input
        type="text"
        placeholder="Search or select company..."
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange(null) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="company-dropdown">
          {filtered.map(c => (
            <div key={c.id} className="company-option" onClick={() => select(c)}>
              🏢 {c.name}
            </div>
          ))}
          {filtered.length === 0 && search && !adding && (
            <div className="company-option add-new" onClick={() => { setNewName(search); handleAdd(); }}>
              ➕ Add &ldquo;{search}&rdquo; as new company
            </div>
          )}
          {filtered.length === 0 && !search && (
            <div className="company-option" style={{ color: 'var(--text-muted)' }}>No companies yet</div>
          )}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="New company name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? '...' : 'Add'}
            </button>
          </div>
        </div>
      )}
      {value && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--success)' }}>✓ Selected: {value.name}</div>
      )}
    </div>
  )
}
