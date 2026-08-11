import { useEffect, useState, useMemo } from 'react'
import { getDistinctRawProductNames, getMasterProducts, addMasterProduct, upsertProductMapping, deleteProductMapping, getProductMappings, updateMasterProduct, deleteMasterProduct } from '../db/queries.js'

export default function Products() {
  const [rawNames, setRawNames] = useState([])
  const [masterProducts, setMasterProducts] = useState([])
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(true)
  const [newMasterName, setNewMasterName] = useState('')
  const [addingName, setAddingName] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [editModal, setEditModal] = useState(null) // { mp: object, form: {name}, rawSearch: '' }
  const [toast, setToast] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [raw, master, maps] = await Promise.all([
        getDistinctRawProductNames(),
        getMasterProducts(),
        getProductMappings()
      ])
      setRawNames(raw)
      setMasterProducts(master)
      setMappings(maps)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Deduplicate masterProducts by lowercase name
  const uniqueMasterProducts = useMemo(() => {
    const seen = new Set()
    return masterProducts.filter(mp => {
      const key = mp.name.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [masterProducts])

  const handleAddMaster = async () => {
    if (!newMasterName.trim()) return
    setAddingName(true)
    try {
      await addMasterProduct(newMasterName.trim(), null)
      setNewMasterName('')
      showToast('Master name created!')
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setAddingName(false)
    }
  }

  const handleSaveMasterEdit = async () => {
    if (!editModal.form.name.trim()) return
    setSavingEdit(true)
    try {
      await updateMasterProduct(editModal.mp.id, {
        name: editModal.form.name.trim(),
        category: null
      })
      showToast('Master details saved!')
      setEditModal(null)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteMaster = async () => {
    if (!window.confirm("Are you sure you want to delete this master product? All mappings will be lost.")) return
    try {
      await deleteMasterProduct(editModal.mp.id)
      showToast('Master product deleted!')
      setEditModal(null)
      load()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const toggleMapping = async (rawName, masterId, isCurrentlyMapped) => {
    try {
      if (isCurrentlyMapped) {
        await deleteProductMapping(rawName)
      } else {
        await upsertProductMapping(rawName, masterId)
      }
      const maps = await getProductMappings()
      setMappings(maps)
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const filteredRawNames = useMemo(() => {
    if (!searchTerm.trim()) return rawNames
    const q = searchTerm.toLowerCase()
    return rawNames.filter(rn => rn.name.toLowerCase().includes(q))
  }, [rawNames, searchTerm])

  const modalFilteredRaw = useMemo(() => {
    let raw = rawNames;
    if (editModal?.rawSearch?.trim()) {
      const q = editModal.rawSearch.toLowerCase()
      raw = raw.filter(rn => rn.name.toLowerCase().includes(q))
    }
    // Sort so that mapped items are forced to the top
    return raw.slice().sort((a, b) => {
      const mapA = mappings.find(m => m.raw_name?.toLowerCase() === a.name.toLowerCase())
      const mapB = mappings.find(m => m.raw_name?.toLowerCase() === b.name.toLowerCase())
      const isMineA = mapA?.master_product_id === editModal?.mp?.id
      const isMineB = mapB?.master_product_id === editModal?.mp?.id
      if (isMineA && !isMineB) return -1
      if (!isMineA && isMineB) return 1
      return 0
    })
  }, [rawNames, editModal?.rawSearch, editModal?.mp?.id, mappings])

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading products...</span></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Products & Mappings</div>
          <div className="page-subtitle">Standardize raw names under master products</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* Left: Raw OCR Names */}
        <div className="card">
          <div className="section-header" style={{ marginBottom: 12 }}>
            <div className="section-title">🕵️ Raw Names ({rawNames.length})</div>
            <input 
              type="text" 
              placeholder="Filter names..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 12, width: 140 }}
            />
          </div>
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {filteredRawNames.map((rn, idx) => {
              const map = mappings.find(m => m.raw_name?.toLowerCase() === rn.name.toLowerCase())
              return (
                <div key={idx} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rn.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Found {rn.count} times</div>
                  </div>
                  {map?.master_products ? (
                    <span className="badge badge-won" style={{ fontSize: 10 }}>{map.master_products.name}</span>
                  ) : (
                    <span className="badge badge-pending" style={{ fontSize: 10 }}>unmapped</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Master Manager */}
        <div className="flex-col gap-20">
          <div className="card">
            <div className="section-title mb-12">✨ Create Master Name</div>
            <div className="flex gap-8">
              <input type="text" value={newMasterName} onChange={e => setNewMasterName(e.target.value)} placeholder="Master Name..." style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={handleAddMaster} disabled={addingName || !newMasterName.trim()}>
                {addingName ? '...' : '+'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="section-title mb-12">📦 Mapping Manager ({uniqueMasterProducts.length})</div>
            <div style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
              {uniqueMasterProducts.map(mp => (
                <div 
                  key={mp.id} 
                  className="list-item" 
                  onClick={() => setEditModal({ mp, form: { name: mp.name }, rawSearch: '' })}
                  style={{ 
                    padding: '12px', 
                    border: '1px solid var(--border-subtle)', 
                    borderRadius: 8, 
                    marginBottom: 8, 
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{mp.name}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--primary-light)' }}>See Children & Edit →</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="modal" style={{ maxWidth: 650, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editModal.form.name}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditModal(null)}>✕</button>
            </div>
            
            <div className="flex-col gap-20">
              <div className="flex-col gap-8">
                <label className="label-sm">Edit Master Name</label>
                <div className="flex gap-8">
                  <input 
                    type="text" 
                    value={editModal.form.name} 
                    onChange={e => setEditModal(prev => ({ ...prev, form: { ...prev.form, name: e.target.value } }))}
                    placeholder="Master Name"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={handleSaveMasterEdit} disabled={savingEdit}>
                    {savingEdit ? '...' : 'Save Details'}
                  </button>
                  <button className="btn btn-danger" onClick={handleDeleteMaster}>
                    Delete Master
                  </button>
                </div>
              </div>

              <div className="flex-col gap-8">
                <div className="flex justify-between items-center">
                  <label className="label-sm">Map Raw Children</label>
                  <input 
                    type="text" 
                    placeholder="Search children..." 
                    value={editModal.rawSearch}
                    onChange={e => setEditModal(prev => ({ ...prev, rawSearch: e.target.value }))}
                    style={{ padding: '4px 8px', fontSize: 11, width: 150 }}
                  />
                </div>
                <div style={{ 
                  maxHeight: 300, 
                  overflowY: 'auto', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: 6,
                  background: 'rgba(0,0,0,0.1)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 8 }}>
                    {modalFilteredRaw.map((rn, idx) => {
                      const map = mappings.find(m => m.raw_name?.toLowerCase() === rn.name.toLowerCase())
                      const isMine = map?.master_product_id === editModal.mp.id
                      const isOthers = map?.master_product_id && map.master_product_id !== editModal.mp.id
                      const otherName = isOthers ? map.master_products?.name : ''

                      return (
                        <label key={idx} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          padding: '6px 8px', 
                          borderRadius: 4,
                          background: isMine ? 'rgba(124,58,237,0.15)' : 'transparent',
                          opacity: isOthers ? 0.4 : 1,
                          cursor: isOthers ? 'not-allowed' : 'pointer',
                          fontSize: 11
                        }}>
                          <input 
                            type="checkbox" 
                            checked={isMine} 
                            disabled={isOthers}
                            onChange={() => toggleMapping(rn.name, editModal.mp.id, isMine)} 
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rn.name}
                            {isOthers && <span style={{ fontSize: 9, marginLeft: 4, fontStyle: 'italic' }}>({otherName})</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
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
