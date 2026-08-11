import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useOrgStore } from './stores/orgStore.js'
import Layout from './components/Layout/Layout.jsx'
import Login from './pages/Login.jsx'
import CreateOrganisation from './pages/CreateOrganisation.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Quotations from './pages/Quotations.jsx'
import QuotationUpload from './pages/QuotationUpload.jsx'
import QuotationDetail from './pages/QuotationDetail.jsx'
import MasterDatabase from './pages/MasterDatabase.jsx'
import Companies from './pages/Companies.jsx'
import CompanyDetail from './pages/CompanyDetail.jsx'
import Suppliers from './pages/Suppliers.jsx'
import SupplierDetail from './pages/SupplierDetail.jsx'
import Products from './pages/Products.jsx'
import Settings from './pages/Settings.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { setErrorUser } from './lib/reportError.js'

export default function App() {
  const session = useAuthStore((state) => state.session)
  const initialising = useAuthStore((state) => state.initialising)
  const init = useAuthStore((state) => state.init)

  const org = useOrgStore((state) => state.org)
  const orgLoading = useOrgStore((state) => state.loading)
  const loadOrg = useOrgStore((state) => state.load)
  const clearOrg = useOrgStore((state) => state.clear)

  useEffect(() => {
    let unsubscribe
    init().then((fn) => { unsubscribe = fn })
    return () => { if (unsubscribe) unsubscribe() }
  }, [init])

  // The organisation is per-session: load it on sign in, drop it on sign out.
  useEffect(() => {
    if (session) loadOrg()
    else clearOrg()
  }, [session, loadOrg, clearOrg])

  // Tag error reports with who hit them, without sending any personal detail.
  useEffect(() => {
    setErrorUser(session?.user?.id ?? null, org?.id ?? null)
  }, [session, org])

  // Wait for Supabase to say whether a session already exists, otherwise a
  // signed-in user sees the login form flash on every page refresh.
  if (initialising) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
        <span>Loading…</span>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  if (orgLoading) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
        <span>Loading your workspace…</span>
      </div>
    )
  }

  // Signed in, but not a member of any organisation yet.
  if (!org) {
    return <CreateOrganisation />
  }

  return (
    <Layout>
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/quotations" element={<Quotations />} />
        <Route path="/quotations/new" element={<QuotationUpload />} />
        <Route path="/quotations/:id" element={<QuotationDetail />} />
        <Route path="/master-database" element={<MasterDatabase />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/suppliers/:id" element={<SupplierDetail />} />
        <Route path="/products" element={<Products />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      </ErrorBoundary>
    </Layout>
  )
}
