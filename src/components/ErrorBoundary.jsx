import { Component } from 'react'
import { reportError } from '../lib/reportError.js'

/**
 * Catches render errors so one broken page doesn't leave a blank white screen
 * with no explanation — which is what happened before, on every crash.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    reportError(error, { where: 'render', componentStack: info?.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="empty-state" style={{ padding: 60 }}>
        <span className="empty-icon">⚠️</span>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>This page hit an error</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 420, margin: '0 auto 20px' }}>
          Nothing you had saved is affected. Reloading usually clears it — if it
          keeps happening, send us the time it occurred and what you were doing.
        </p>
        <div className="flex gap-8 justify-center">
          <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
            Reload the page
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
        {import.meta.env.DEV && (
          <pre style={{ marginTop: 24, textAlign: 'left', fontSize: 11, overflowX: 'auto', color: 'var(--danger)' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        )}
      </div>
    )
  }
}
