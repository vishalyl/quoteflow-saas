import { NavLink, useLocation, Link } from 'react-router-dom'
import { useOrgStore } from '../../stores/orgStore.js'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '⊞', exact: true },
  { path: '/quotations', label: 'Quotations', icon: '📄' },
  { path: '/master-database', label: 'Master Database', icon: '🗄️' },
  { path: '/companies', label: 'Companies', icon: '🏢' },
  { path: '/suppliers', label: 'Suppliers', icon: '🏭' },
  { path: '/products', label: 'Products', icon: '📦' },
]

/** Up to three initials from the organisation name, for the logo mark. */
function initialsOf(name) {
  if (!name) return 'QF'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(word => word[0].toUpperCase())
    .join('')
}

export default function Sidebar() {
  const location = useLocation()
  const org = useOrgStore((s) => s.org)

  const isActive = (path, exact) => {
    if (exact) return location.pathname === path
    return location.pathname.startsWith(path)
  }

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="sidebar-logo-icon">{initialsOf(org?.name)}</div>
        <span className="sidebar-logo-text">{org?.name || 'QuoteFlow'}</span>
      </Link>
      <nav className="sidebar-nav">
        <span className="sidebar-section-label">Navigation</span>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`nav-item ${isActive(item.path, item.exact) ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <span className="sidebar-section-label" style={{ marginTop: 'auto' }}>Actions</span>
        <NavLink to="/quotations/new" className="nav-item">
          <span className="nav-icon">➕</span>New Quotation
        </NavLink>
        <NavLink to="/settings" className={`nav-item ${isActive('/settings') ? 'active' : ''}`}>
          <span className="nav-icon">⚙️</span>Settings
        </NavLink>
      </nav>
    </aside>
  )
}
