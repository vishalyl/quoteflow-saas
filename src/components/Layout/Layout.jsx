import Sidebar from './Sidebar.jsx'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useOrgStore } from '../../stores/orgStore.js'

const titles = {
  '/': 'Dashboard',
  '/quotations': 'Quotations',
  '/quotations/new': 'New Quotation',
  '/master-database': 'Master Database',
  '/companies': 'Companies',
  '/products': 'Products',
  '/settings': 'Settings',
}

export default function Layout({ children }) {
  const location = useLocation()
  const path = location.pathname
  const orgName = useOrgStore((s) => s.org?.name)
  const title = titles[path] || (path.includes('/quotations/') ? 'Quotation Detail' : orgName || 'QuoteFlow')
  const displayName = useAuthStore((s) => s.displayName())
  const signOut = useAuthStore((s) => s.signOut)

  // Clearing the session re-renders App into the login screen; no navigation.
  const handleLogout = () => { signOut() }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '10px', borderRight: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {displayName}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </header>
        <main className="page-content fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
