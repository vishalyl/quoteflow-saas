import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'

const MODES = {
  signin: { title: 'Sign in', action: 'Sign in', busy: 'Signing in…' },
  signup: { title: 'Create your account', action: 'Create account', busy: 'Creating account…' },
  reset:  { title: 'Reset your password', action: 'Send reset link', busy: 'Sending…' },
}

// Supabase returns terse, technical messages. Say what went wrong and what to do.
function friendlyError(err) {
  const raw = err?.message || 'Something went wrong. Try again.'
  if (/invalid login credentials/i.test(raw)) return 'That email and password don\'t match an account.'
  if (/email not confirmed/i.test(raw)) return 'Confirm your email first — check your inbox for the link we sent.'
  if (/user already registered/i.test(raw)) return 'An account with that email already exists. Sign in instead.'
  if (/password should be at least/i.test(raw)) return 'Password must be at least 6 characters.'
  if (/rate limit|too many/i.test(raw)) return 'Too many attempts. Wait a minute and try again.'
  if (/fetch|network/i.test(raw)) return 'Can\'t reach the server. Check your connection.'
  return raw
}

export default function Login() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const sendPasswordReset = useAuthStore((s) => s.sendPasswordReset)

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setNotice('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        // App re-renders on the auth state change; no navigation needed.
      } else if (mode === 'signup') {
        const { needsEmailConfirmation } = await signUp(email, password, fullName)
        if (needsEmailConfirmation) {
          setNotice(`Account created. Check ${email} for a confirmation link, then sign in.`)
          setMode('signin')
        }
      } else {
        await sendPasswordReset(email)
        setNotice(`If an account exists for ${email}, a reset link is on its way.`)
        setMode('signin')
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  const copy = MODES[mode]
  const canSubmit = mode === 'reset'
    ? Boolean(email)
    : Boolean(email && password) && (mode !== 'signup' || Boolean(fullName))

  return (
    <div style={styles.container}>
      <div style={styles.loginBox}>
        <h1 style={styles.title}>QuoteFlow</h1>
        <p style={styles.subtitle}>{copy.title}</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <div style={styles.formGroup}>
              <label htmlFor="fullName" style={styles.label}>Your name</label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Priya Sharma"
                style={styles.input}
                disabled={loading}
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              style={styles.input}
              disabled={loading}
            />
          </div>

          {mode !== 'reset' && (
            <div style={styles.formGroup}>
              <label htmlFor="password" style={styles.label}>Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                style={styles.input}
                disabled={loading}
              />
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
          {notice && <p style={styles.notice}>{notice}</p>}

          <button type="submit" style={styles.button} disabled={loading || !canSubmit}>
            {loading ? copy.busy : copy.action}
          </button>
        </form>

        <div style={styles.switcher}>
          {mode === 'signin' && (
            <>
              <button type="button" style={styles.linkBtn} onClick={() => switchMode('reset')}>
                Forgot password?
              </button>
              <button type="button" style={styles.linkBtn} onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </>
          )}
          {mode !== 'signin' && (
            <button type="button" style={styles.linkBtn} onClick={() => switchMode('signin')}>
              ← Back to sign in
            </button>
          )}
        </div>
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
  },
  loginBox: {
    background: 'white',
    padding: '40px',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1a1a1a',
    margin: '0 0 8px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    textAlign: 'center',
    margin: '0 0 30px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1a1a1a',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
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
    transition: 'background 0.2s',
    marginTop: '10px',
  },
  error: {
    color: '#dc3545',
    fontSize: '13px',
    margin: '0',
    padding: '8px 12px',
    background: '#f8d7da',
    borderRadius: '6px',
    border: '1px solid #f5c6cb',
  },
  notice: {
    color: '#0f5132',
    fontSize: '13px',
    margin: '0',
    padding: '8px 12px',
    background: '#d1e7dd',
    borderRadius: '6px',
    border: '1px solid #badbcc',
  },
  switcher: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '20px',
    flexWrap: 'wrap',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#667eea',
    fontSize: '13px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}
