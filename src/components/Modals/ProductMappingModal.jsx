import { useState, useEffect } from 'react'
import { getMasterProducts, addMasterProduct, upsertProductMapping } from '../../db/queries'

export default function ProductMappingModal({ rawName, onMappingComplete, onClose }) {
  const [masterProducts, setMasterProducts] = useState([])
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('select') // 'select' or 'new'
  const [newName, setNewName] = useState(rawName)
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getMasterProducts().then(mps => {
      // Deduplicate by name just in case there are duplicates
      const unique = []
      const seen = new Set()
      mps?.forEach(m => {
        const key = m.name?.toLowerCase().trim()
        if (key && !seen.has(key)) {
          seen.add(key)
          unique.push(m)
        }
      })
      setMasterProducts(unique)
    }).catch(console.error)
  }, [rawName])

  const filtered = masterProducts.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = async (mp) => {
    setLoading(true)
    try {
      await upsertProductMapping(rawName, mp.id)
      onMappingComplete(mp)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const mp = await addMasterProduct(newName.trim(), newCategory.trim() || null)
      await upsertProductMapping(rawName, mp.id)
      onMappingComplete(mp)
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="section-title">Product Mapping</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <div className="label-sm">Product from Quotation</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
            {rawName}
          </div>
        </div>

        <div className="btn-group mb-16">
          <button 
            className={`btn btn-sm ${mode === 'select' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('select')}
          >
            Map to Existing
          </button>
          <button 
            className={`btn btn-sm ${mode === 'new' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setMode('new')}
          >
            Create as New Master
          </button>
        </div>

        {mode === 'select' ? (
          <div>
            <div className="form-group mb-12">
              <input 
                type="text" 
                placeholder="Search master products..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              {filtered.length > 0 ? filtered.map(mp => (
                <div 
                  key={mp.id} 
                  className="company-option"
                  onClick={() => handleSelect(mp)}
                  style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px' }}
                >
                  <div style={{ fontWeight: 600 }}>{mp.name}</div>
                  {mp.category && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{mp.category}</div>}
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No master products found.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-col gap-12">
            <div className="form-group">
              <label>Master Product Name</label>
              <input 
                type="text" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                placeholder="Canonical name..."
              />
            </div>
            <div className="form-group">
              <label>Category (Optional)</label>
              <input 
                type="text" 
                value={newCategory} 
                onChange={e => setNewCategory(e.target.value)} 
                placeholder="e.g. Hydraulic, O-Ring..."
              />
            </div>
            <button className="btn btn-primary w-full mt-8" onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating...' : 'Create Master & Map Product'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
