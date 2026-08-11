import { useRef } from 'react'
import { toJpeg } from 'html-to-image'

export default function ClientViewModal({ companyName, rows, onClose }) {
  const contentRef = useRef(null)

  const filteredRows = rows.filter(r => r.raw_product_name?.trim())

  const title = companyName ? `Quotation to ${companyName}` : 'Quotation'

  const handleDownloadJpeg = async () => {
    if (!contentRef.current) return
    try {
      // Save original styles
      const original = {
        flex: contentRef.current.style.flex,
        overflowY: contentRef.current.style.overflowY,
        maxHeight: contentRef.current.style.maxHeight,
        height: contentRef.current.style.height,
        minHeight: contentRef.current.style.minHeight
      }

      // Remove flex constraint and scroll restrictions
      contentRef.current.style.flex = 'none'
      contentRef.current.style.overflowY = 'visible'
      contentRef.current.style.maxHeight = 'none'
      contentRef.current.style.height = 'auto'
      contentRef.current.style.minHeight = '0'

      // Wait for layout to recalculate
      await new Promise(resolve => setTimeout(resolve, 100))

      const dataUrl = await toJpeg(contentRef.current, {
        quality: 0.95,
        backgroundColor: '#fff'
      })

      // Restore original styles
      contentRef.current.style.flex = original.flex
      contentRef.current.style.overflowY = original.overflowY
      contentRef.current.style.maxHeight = original.maxHeight
      contentRef.current.style.height = original.height
      contentRef.current.style.minHeight = original.minHeight

      const link = document.createElement('a')
      link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.jpeg`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Download failed', err)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', zIndex: 2000 }}>
      {/* Scrollable Container */}
      <div 
        className="client-view-scroll-container"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={onClose}
      >
        <div
          className="client-view-modal"
          onClick={e => e.stopPropagation()}
          style={{
            maxWidth: 800,
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#fff',
            borderRadius: 12,
            boxShadow: '0 30px 60px rgba(0,0,0,0.3)',
            border: '1px solid #eee'
          }}
        >
          {/* Top Actions Bar (Sticky - always visible) */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderBottom: '1px solid #efefef',
            backgroundColor: '#fafafa',
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            flexShrink: 0
          }}>
            <span style={{ color: '#666', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>POP-UP PREVIEW</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleDownloadJpeg}
                style={{ background: '#000', borderColor: '#000', color: '#fff', fontWeight: 700 }}
              >
                📥 DOWNLOAD
              </button>
              <button
                onClick={onClose}
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 18 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* The Compact Sheet Content (Scrollable) */}
          <div
            ref={contentRef}
            style={{
              backgroundColor: '#fff',
              color: '#000',
              padding: '35px',
              overflowY: 'auto',
              flex: 1,
              minHeight: 0
            }}
          >
            <div style={{ borderBottom: '6px solid #000', paddingBottom: 15, marginBottom: 30 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-1px', color: '#000', lineHeight: 1.1 }}>
                {title}
              </h1>
            </div>

            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              border: '3px solid #000',
            }}>
              <thead>
                <tr style={{ backgroundColor: '#fff', color: '#000' }}>
                  <th style={headerCellStyle}>#</th>
                  <th style={{ ...headerCellStyle, textAlign: 'left' }}>DESCRIPTION</th>
                  <th style={headerCellStyle}>QTY</th>
                  <th style={headerCellStyle}>UNIT</th>
                  <th style={{ ...headerCellStyle, textAlign: 'right' }}>PRICE</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const qty = parseFloat(row.quantity) || 0
                  const price = parseFloat(row.quoted_price) || parseFloat(row.rate) || 0

                  return (
                    <tr key={i} style={{ borderBottom: '2px solid #000' }}>
                      <td style={{ ...cellStyle, textAlign: 'center', width: 30 }}>{i + 1}</td>
                      <td style={cellStyle}>{row.raw_product_name}</td>
                      <td style={{ ...cellStyle, textAlign: 'center', width: 50 }}>{qty || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'center', width: 50 }}>{row.unit || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', width: 110 }}>{price ? `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const headerCellStyle = {
  border: '2px solid #000',
  padding: '12px 10px',
  fontSize: '11px',
  fontWeight: 900,
  color: '#000',
  textTransform: 'uppercase'
}

const cellStyle = {
  border: '2px solid #000',
  padding: '10px 10px',
  fontSize: '13px',
  fontWeight: 800,
  color: '#000',
  lineHeight: 1.3
}


