import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { apiFetch, getCurrentUserId } from '../lib/api'
import Standup from './Standup'
import Focus from './Focus'

const TAB_EMPTY_DESCRIPTIONS = {
  retro: 'Reflect on your sprint. Add cards, vote on what matters, and track action items.',
  standup: "Share what you're working on today. Post your daily check-in so your team stays in sync.",
  focus: 'Start a focused work session. Set a goal, join your team, and work together in real-time.',
}

export default function Workspace() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const workspaceFromState = state?.workspace
  const currentUserId = getCurrentUserId()
  const [activeTab, setActiveTab] = useState('retro')

  const [workspace, setWorkspace] = useState(workspaceFromState || null)
  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [sessionName, setSessionName] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      const [membersRes, sessionsRes, workspacesRes] = await Promise.all([
        apiFetch(`/workspaces/${id}/members`),
        apiFetch(`/workspaces/${id}/sessions`),
        apiFetch('/workspaces'),
      ])
      if (membersRes.status === 401 || sessionsRes.status === 401 || workspacesRes.status === 401) {
        sessionStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!membersRes.ok) {
        const err = await membersRes.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load workspace members')
        return
      }
      if (!sessionsRes.ok) {
        const err = await sessionsRes.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load sessions')
        return
      }
      setMembers(await membersRes.json())
      setSessions(await sessionsRes.json())
      if (workspacesRes.ok) {
        const all = await workspacesRes.json()
        const found = all.find((w) => w.id === id)
        if (found) setWorkspace(found)
      }
    } catch {
      setLoadError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  function toggleMember(userId) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((m) => m !== userId) : [...prev, userId]
    )
  }

  async function handleCreateSession(e) {
    e.preventDefault()
    if (!sessionName.trim()) return
    setCreateError(null)
    setCreating(true)
    try {
      const res = await apiFetch(`/workspaces/${id}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          name: sessionName.trim(),
          member_ids: selectedMemberIds,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.detail || 'Failed to create session')
        return
      }
      const session = await res.json()
      setSessionName('')
      setSelectedMemberIds([])
      await loadData()
      navigate(`/sessions/${session.id}`)
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyInvite() {
    if (!workspace?.invite_code) return
    try {
      await navigator.clipboard.writeText(workspace.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard API unavailable — nothing more we can do here.
    }
  }

  async function handleDeleteWorkspace() {
    if (
      !window.confirm(
        'Delete this workspace? This permanently removes all its retro sessions, standups, and focus history. This cannot be undone.'
      )
    ) {
      return
    }
    setActionError(null)
    setActionBusy(true)
    try {
      const res = await apiFetch(`/workspaces/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError(err.detail || 'Failed to delete workspace')
        return
      }
      navigate('/')
    } catch {
      setActionError('Network error')
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDeleteSession(sessionId) {
    if (
      !window.confirm(
        'Delete this session? This permanently removes all its cards, votes, and reactions. This cannot be undone.'
      )
    ) {
      return
    }
    setActionError(null)
    try {
      const res = await apiFetch(`/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError(err.detail || 'Failed to delete session')
        return
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      setActionError('Network error')
    }
  }

  async function handleLeaveWorkspace() {
    if (!window.confirm('Leave this workspace? You can rejoin later with the invite code.')) return
    setActionError(null)
    setActionBusy(true)
    try {
      const res = await apiFetch(`/workspaces/${id}/leave`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setActionError(err.detail || 'Failed to leave workspace')
        return
      }
      navigate('/')
    } catch {
      setActionError('Network error')
    } finally {
      setActionBusy(false)
    }
  }

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pastSessions = sessions.filter((s) => s.status !== 'active')
  const isCreator = workspace && currentUserId && workspace.created_by === currentUserId
  const retroEmpty = !loading && activeSessions.length === 0 && pastSessions.length === 0

  return (
    <div className="page">
      <Link to="/" className="back-link">Back to workspaces</Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>{workspace?.name || 'Workspace'}</h2>
          {members.length > 0 && (
            <p className="muted-text" style={{ marginTop: 4 }}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to={`/workspace/${id}/dashboard`} state={{ workspace }} className="navbar-link">
            Dashboard
          </Link>
          {isCreator ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm danger-text"
              disabled={actionBusy}
              onClick={handleDeleteWorkspace}
            >
              Delete workspace
            </button>
          ) : (
            workspace && (
              <button
                type="button"
                className="btn btn-ghost btn-sm danger-text"
                disabled={actionBusy}
                onClick={handleLeaveWorkspace}
              >
                Leave workspace
              </button>
            )
          )}
        </div>
      </div>

      {workspace?.invite_code && (
        <div className="invite-row">
          <span className="muted-text">Invite code: <code>{workspace.invite_code}</code></span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopyInvite}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      <PresenceBar workspaceId={id} />

      {actionError && <p className="error-text">{actionError}</p>}

      <div className="tab-nav">
        <button
          className={`tab-nav-btn ${activeTab === 'retro' ? 'active' : ''}`}
          onClick={() => setActiveTab('retro')}
        >
          Retro
        </button>
        <button
          className={`tab-nav-btn ${activeTab === 'standup' ? 'active' : ''}`}
          onClick={() => setActiveTab('standup')}
        >
          Standup
        </button>
        <button
          className={`tab-nav-btn ${activeTab === 'focus' ? 'active' : ''}`}
          onClick={() => setActiveTab('focus')}
        >
          Focus
        </button>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}

      {activeTab === 'retro' && (
        <>
          {retroEmpty && <p className="tab-empty-description">{TAB_EMPTY_DESCRIPTIONS.retro}</p>}

          <section className="section">
            <h3 className="section-title">Start a retro session</h3>
            <div className="card">
              <form onSubmit={handleCreateSession}>
                <div className="field">
                  <input
                    className="input"
                    placeholder="Session name"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Include members (you're always included)</label>
                  {members.filter((m) => m.user_id !== currentUserId).map((m) => (
                    <label key={m.user_id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(m.user_id)}
                        onChange={() => toggleMember(m.user_id)}
                      />
                      {m.name || m.email || m.user_id}
                    </label>
                  ))}
                </div>
                <button type="submit" disabled={creating} className="btn btn-primary">
                  {creating ? 'Creating...' : 'Create session'}
                </button>
                {createError && <p className="error-text">{createError}</p>}
              </form>
            </div>
          </section>

          <section className="section">
            <h3 className="section-title">Active sessions</h3>
            {loading && <p className="muted-text">Loading...</p>}
            {!loading && activeSessions.length === 0 && <p className="empty-text">No active sessions.</p>}
            <div className="session-card-grid">
              {activeSessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          </section>

          <section className="section">
            <h3 className="section-title">Past sessions</h3>
            {!loading && pastSessions.length === 0 && <p className="empty-text">No past sessions yet.</p>}
            <div className="session-card-grid">
              {pastSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  canDelete={currentUserId && s.created_by === currentUserId}
                  onDelete={handleDeleteSession}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === 'standup' && (
        <Standup workspaceId={id} emptyDescription={TAB_EMPTY_DESCRIPTIONS.standup} />
      )}
      {activeTab === 'focus' && <Focus workspaceId={id} emptyDescription={TAB_EMPTY_DESCRIPTIONS.focus} />}
    </div>
  )
}

function SessionCard({ session, canDelete, onDelete }) {
  return (
    <div className="session-card-wrap">
      <Link to={`/sessions/${session.id}`} className="session-card">
        <div className="session-card-top">
          <strong>{session.name}</strong>
          <span className={`badge ${session.status === 'ended' ? 'badge-ended' : ''}`}>{session.status}</span>
        </div>
        <span className="session-card-link">Open board</span>
      </Link>
      {canDelete && (
        <button
          type="button"
          className="session-card-delete-btn"
          aria-label="Delete session"
          onClick={() => onDelete(session.id)}
        >
          Delete
        </button>
      )}
    </div>
  )
}

function PresenceBar({ workspaceId }) {
  const [online, setOnline] = useState([])

  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        await apiFetch(`/workspaces/${workspaceId}/presence/ping`, { method: 'POST' })
      } catch {
        // Best-effort heartbeat — ignore failures.
      }
    }

    async function poll() {
      try {
        const res = await apiFetch(`/workspaces/${workspaceId}/presence`)
        if (res.ok && !cancelled) setOnline(await res.json())
      } catch {
        // Best-effort poll — ignore failures.
      }
    }

    ping()
    poll()
    const pingId = setInterval(ping, 10000)
    const pollId = setInterval(poll, 8000)
    return () => {
      cancelled = true
      clearInterval(pingId)
      clearInterval(pollId)
    }
  }, [workspaceId])

  if (online.length === 0) return null

  return (
    <div className="presence-bar">
      <span className="presence-dot" />
      <span>
        {online.length} online &middot; {online.map((u) => u.name).join(', ')}
      </span>
    </div>
  )
}
