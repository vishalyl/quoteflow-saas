import { useState } from 'react'
import Papa from 'papaparse'

/**
 * Exports rows to CSV.
 *
 * Pass `data` for rows already on screen, or `fetchData` for a page that only
 * holds one page at a time — the export then pulls a full filtered set from the
 * server rather than exporting whatever happened to be rendered.
 */
export default function ExportButton({ data = null, fetchData = null, columns = [], filename = 'export' }) {
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)
    try {
      const rows = fetchData ? await fetchData() : (data || [])
      if (!rows.length) return

      const csv = Papa.unparse(rows.map(row =>
        Object.fromEntries(columns.map(col => [
          col.label,
          col.render ? String(col.render(row) ?? '') : String(row[col.key] ?? ''),
        ]))
      ))

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  const nothingToExport = !fetchData && !(data && data.length)

  return (
    <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={busy || nothingToExport}>
      {busy ? 'Preparing…' : '⬇ Export CSV'}
    </button>
  )
}
