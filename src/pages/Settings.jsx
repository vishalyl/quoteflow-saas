import { useCallback, useEffect, useState } from 'react'
import {
  listMembers, inviteMember, setMemberRole, removeMember,
  listInvitations, revokeInvitation,
  listDeleted, restoreDeleted, updateOrganisation, getAiUsage,
} from '../db/queries.js'
import { useOrgStore } from '../stores/orgStore.js'
import { useAuthStore } from '../stores/authStore.js'

const TABS = [
  { id: 'team', label: 'Team' },
  { id: 'company', label: 'Company' },
  { id: 'usage', label: 'Usage' },
  { id: 'trash', label: 'Trash' },
]

const ROLE_HELP = {
  owner: 'Full control, including billing, team and cost prices.',
  manager: 'Sees cost prices and margins. Cannot change the team.',
  sales: 'Quotes and follows up. Never sees supplier cost or margin.',
}

function Field({ label, children, hint }) {
  return (
    <div className="flex-col gap-4" style={{ marginBottom: 16 }}>
      <label className="label-sm">{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('team')
  const org = useOrgStore((s) => s.org)
  const role = useOrgStore((s) => s.role)
  const reloadOrg = useOrgStore((s) => s.load)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const isOwner = role === 'owner'

  const [toast, setToast] = useState(null)
  const notify = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">{org?.name}</div>
        </div>
      </div>

      <div className="btn-group mb-20" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && <TeamTab isOwner={isOwner} currentUserId={currentUserId} notify={notify} />}
      {tab === 'company' && <CompanyTab org={org} isOwner={isOwner} onSaved={reloadOrg} notify={notify} />}
      {tab === 'usage' && <UsageTab org={org} />}
      {tab === 'trash' && <TrashTab notify={notify} />}

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  )
}

function TeamTab({ isOwner, currentUserId, notify }) {
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('sales')
  const [inviting, setInviting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, i] = await Promise.all([listMembers(), isOwner ? listInvitations() : []])
      setMembers(m)
      setInvites(i)
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [isOwner, notify])

  useEffect(() => { load() }, [load])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    try {
      await inviteMember(email, inviteRole)
      notify(`Invited ${email}. They join automatically when they sign up with that address.`)
      setEmail('')
      load()
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      await setMemberRole(userId, newRole)
      notify('Role updated.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  const handleRemove = async (userId, label) => {
    if (!window.confirm(`Remove ${label} from your team? Their quotations stay.`)) return
    try {
      await removeMember(userId)
      notify('Removed.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading team…</span></div>

  return (
    <>
      <div className="card mb-20">
        <div className="section-title mb-16">People</div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th /></tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.user_id}>
                  <td style={{ fontWeight: 500 }}>{m.full_name || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                  <td>
                    {isOwner && m.user_id !== currentUserId ? (
                      <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value)}>
                        <option value="owner">Owner</option>
                        <option value="manager">Manager</option>
                        <option value="sales">Sales</option>
                      </select>
                    ) : (
                      <span className="badge badge-pending">{m.role}</span>
                    )}
                  </td>
                  <td>
                    {isOwner && m.user_id !== currentUserId && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => handleRemove(m.user_id, m.email)}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {Object.entries(ROLE_HELP).map(([r, help]) => (
            <div key={r}><strong style={{ textTransform: 'capitalize' }}>{r}</strong> — {help}</div>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="card mb-20">
          <div className="section-title mb-16">Invite someone</div>
          <form onSubmit={handleInvite} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="Email address">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" required />
            </Field>
            <Field label="Role">
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                <option value="sales">Sales</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" type="submit" disabled={inviting || !email}>
                {inviting ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </form>

          {invites.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="label-sm mb-8">Pending invitations</div>
              <div className="flex-col gap-8">
                {invites.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-hover)', borderRadius: 8 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{inv.email}</span>
                    <span className="badge badge-pending">{inv.role}</span>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ color: 'var(--danger)' }}
                      onClick={async () => {
                        try { await revokeInvitation(inv.id); notify('Invitation revoked.'); load() }
                        catch (err) { notify(err.message, 'error') }
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CompanyTab({ org, isOwner, onSaved, notify }) {
  const [form, setForm] = useState({
    name: org?.name || '', gstin: org?.gstin || '', address: org?.address || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateOrganisation(org.id, form)
      await onSaved()
      notify('Company details saved.')
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="section-title mb-16">Company details</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        These appear on quotations you send to clients.
      </p>
      <form onSubmit={handleSave} style={{ maxWidth: 480 }}>
        <Field label="Company name">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={!isOwner} required />
        </Field>
        <Field label="GSTIN" hint="Shown on client-facing quotations.">
          <input value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} disabled={!isOwner} placeholder="22AAAAA0000A1Z5" />
        </Field>
        <Field label="Address">
          <textarea rows={3} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} disabled={!isOwner} />
        </Field>
        {isOwner ? (
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only the owner can change these.</p>
        )}
      </form>
    </div>
  )
}

function UsageTab({ org }) {
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getAiUsage().then(setUsage).catch(err => setError(err.message))
  }, [])

  const pct = usage?.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0

  return (
    <div className="card">
      <div className="section-title mb-16">Requirement pages read this month</div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {usage && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 32, fontWeight: 700 }}>{usage.used}</span>
            <span style={{ color: 'var(--text-muted)' }}>of {usage.limit} included</span>
          </div>
          <div style={{ height: 8, background: 'var(--bg-hover)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct > 85 ? 'var(--warning)' : 'var(--primary)' }} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 16 }}>
            {usage.remaining} pages left. Each image you upload for extraction counts as one page.
          </p>
        </>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>
        Plan: <strong>{org?.plan ?? 'trial'}</strong> · {org?.seats_purchased ?? 0} seats
      </p>
    </div>
  )
}

function TrashTab({ notify }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listDeleted())
    } catch (err) {
      notify(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { load() }, [load])

  const handleRestore = async (tableName, id) => {
    try {
      await restoreDeleted(tableName, id)
      notify('Restored.')
      load()
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  if (loading) return <div className="loading-overlay"><div className="spinner" /><span>Loading trash…</span></div>

  return (
    <div className="card">
      <div className="section-title mb-16">Recently deleted</div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing has been deleted.</p>
      ) : (
        <div className="flex-col gap-8">
          {rows.map(row => (
            <div key={`${row.table_name}-${row.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-hover)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {row.table_name.replace('_', ' ')} · deleted {new Date(row.deleted_at).toLocaleDateString('en-IN')}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => handleRestore(row.table_name, row.id)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
