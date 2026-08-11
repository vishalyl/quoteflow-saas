import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase.js'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = error => reject(error)
  })
}

export default function FileUploader({ onComplete }) {
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('')
  const [processing, setProcessing] = useState(false)
  const [previews, setPreviews] = useState([])
  const inputRef = useRef()

  const processFiles = async fileList => {
    const filesArray = Array.from(fileList).slice(0, 10) // Max 10 images at once
    if (filesArray.length === 0) return
    setProcessing(true)
    setStatus(`Reading ${filesArray.length} image${filesArray.length > 1 ? 's' : ''}…`)
    setPreviews(filesArray.map(f => URL.createObjectURL(f)))

    try {
      const images = await Promise.all(filesArray.map(fileToBase64))

      // The extraction key lives on the server. This call carries the user's
      // session token; the function refuses anyone who isn't signed in.
      const { data, error } = await supabase.functions.invoke('extract-requirement', {
        body: { images },
      })

      // Errors from the function come back as a non-2xx response; read the
      // message we deliberately put in the body rather than showing the status.
      if (error) {
        let message = 'Could not read those images. Try again.'
        try {
          const body = await error.context?.json()
          if (body?.error) message = body.error
        } catch { /* fall back to the generic message */ }
        throw new Error(message)
      }

      const rows = data?.rows ?? []
      if (rows.length === 0) throw new Error('No table rows were found in those images.')

      setStatus(`Extracted ${rows.length} rows from ${filesArray.length} image(s).`)
      onComplete(rows, `Success: Extracted ${rows.length} rows from ${filesArray.length} images.`)
    } catch (err) {
      console.error(err)
      setStatus(err.message)
      onComplete([{ raw_product_name: '', quantity: '', unit: '', rate: '' }], '')
    } finally {
      setProcessing(false)
    }
  }

  const onDrop = e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files) }
  const onFileChange = e => { if (e.target.files.length) processFiles(e.target.files) }

  return (
    <div>
      <div
        className={`drop-zone ${dragging ? 'drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
        {previews.length > 0
          ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              {previews.map((p, i) => (
                <img key={i} src={p} alt={`uploaded-${i}`} style={{ height: 100, borderRadius: 6, objectFit: 'contain', border: '1px solid var(--border)' }} />
              ))}
            </div>
          )
          : <span className="drop-zone-icon">📷</span>
        }
        <div className="drop-zone-title">{previews.length > 0 ? 'Click to upload different images' : 'Drop multiple screenshots here or click to browse'}</div>
        <div className="drop-zone-sub">Powered by OpenAI Vision (GPT-4o)</div>
      </div>
      {processing && (
        <div className="ocr-progress mt-12">
          <div className="spinner" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{status}</div>
            <div className="progress-bar-wrapper">
              <div className="progress-bar-fill" style={{ width: '100%', animation: 'pulse 1s infinite alternate' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
