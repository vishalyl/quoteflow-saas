import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getSuppliers, addSupplier, updateSupplier, deleteSupplier } from '../db/queries.js'

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'add' | 'edit'
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', contact: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = () => {
    setLoading(true)
    getSuppliers().then(setSuppliers).catch(console.error).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Deduplicate by lowercase name — keep first occurrence per unique name
  const uniqueSuppliers = useMemo(() => {
    const seen = new Set()
    return suppliers.filter(c => {
      const key = c.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [suppliers])

  const openAdd = () => { setForm({ name: '', contact: '', notes: '' }); setEditing(null); setModal('add') }
  const openEdit = c => { setForm({ name: c.name, contact: c.contact || '', notes: c.notes || '' }); setEditing(c); setModal('edit') }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (modal === 'add') {
        await addSupplier(form.name.trim(), form.contact || null, form.notes || null)
        showToast('Supplier added!')
      } else {
        await updateSupplier(editing.id, { name: form.name.trim(), contact: form.contact || null, notes: form.notes || null })
        showToast('Supplier updated!')
      }
      setModal(null)
      load()
    } catch (err) {
      showToast(err.message || 'Error', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this supplier? All linked data will be unlinked.')) return
    try {
      await deleteSupplier(id)
      showToast('Deleted')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading...</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Suppliers</div>
          <div className="page-subtitle">{uniqueSuppliers.length} suppliers</div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-primary" onClick={openAdd}>+ Add Supplier</button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead><tr><th>#</th><th>Supplier Name</th><th>Actions</th></tr></thead>
          <tbody>
            {uniqueSuppliers.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No suppliers yet</td></tr>
            ) : uniqueSuppliers.map((c, i) => (
              <tr key={c.id}>
                <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>
                  <Link to={`/suppliers/${c.id}`} style={{ color: 'var(--primary-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🏭 {c.name}
                  </Link>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'add' ? 'Add Supplier' : 'Edit Supplier'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="flex-col flex gap-12">
              <div className="form-group">
                <label>Supplier Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name..." autoFocus />
              </div>
              <div className="form-group">
                <label>Contact / Info</label>
                <input type="text" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Email, phone..." />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." rows={3} style={{ fontFamily: 'monospace' }} />
              </div>
              {modal === 'edit' && (
                <div className="form-group">
                  <label style={{ color: 'var(--text-muted)' }}>Created Date</label>
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                    {new Date(editing.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
              )}
              <div className="flex gap-8 justify-between">
                {modal === 'edit' && (
                  <button className="btn btn-danger" onClick={() => { handleDelete(editing.id); setModal(null) }}>
                    Delete
                  </button>
                )}
                <div className="flex gap-8" style={{ marginLeft: 'auto' }}>
                  <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                    {saving ? 'Saving...' : modal === 'add' ? 'Add Supplier' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✓' : '✕'} {toast.msg}</div>}
    </div>
  )
}
