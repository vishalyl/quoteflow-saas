import { useState } from 'react'
import { useOrgStore } from '../stores/orgStore.js'
import { useAuthStore } from '../stores/authStore.js'

/**
 * Shown once, to a signed-in user who doesn't belong to an organisation yet.
 * Creating one makes them its owner.
 */
export default function CreateOrganisation() {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const createOrg = useOrgStore((s) => s.createOrg)
  const signOut = useAuthStore((s) => s.signOut)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await createOrg(name)
    } catch (err) {
      setError(err.message || 'Could not create the organisation. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.box}>
        <h1 style={styles.title}>Name your company</h1>
        <p style={styles.subtitle}>
          Your quotations, clients, suppliers and pricing history all live under this name.
          Only people you invite can see them.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label htmlFor="orgName" style={styles.label}>Company name</label>
            <input
              id="orgName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Industrial Rubber Products"
              style={styles.input}
              disabled={saving}
              autoFocus
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.button} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create company'}
          </button>
        </form>

        <button type="button" style={styles.linkBtn} onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: 20,
  },
  box: {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    width: '100%',
    maxWidth: '440px',
  },
  title: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 10px' },
  subtitle: { fontSize: '14px', color: '#666', lineHeight: 1.5, margin: '0 0 26px' },
  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '14px', fontWeight: '500', color: '#1a1a1a' },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  button: {
    padding: '12px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  error: {
    color: '#dc3545',
    fontSize: '13px',
    margin: 0,
    padding: '8px 12px',
    background: '#f8d7da',
    borderRadius: '6px',
    border: '1px solid #f5c6cb',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    marginTop: 20,
    color: '#667eea',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}
