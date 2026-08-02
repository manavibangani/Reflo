import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { apiFetch, getCurrentUserId } from '../lib/api'

export default function Workspace() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const workspaceFromState = state?.workspace
  const currentUserId = getCurrentUserId()

  const [members, setMembers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [sessionName, setSessionName] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  async function loadData() {
    setLoading(true)
    setLoadError(null)
    try {
      const [membersRes, sessionsRes] = await Promise.all([
        apiFetch(`/workspaces/${id}/members`),
        apiFetch(`/workspaces/${id}/sessions`),
      ])
      if (membersRes.status === 401 || sessionsRes.status === 401) {
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

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pastSessions = sessions.filter((s) => s.status !== 'active')

  return (
    <div className="page">
      <Link to="/" className="back-link">&larr; Back to workspaces</Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h2 style={{ margin: 0 }}>{workspaceFromState?.name || 'Workspace'}</h2>
        <Link to={`/workspace/${id}/dashboard`} state={{ workspace: workspaceFromState }} className="navbar-link">
          Dashboard
        </Link>
      </div>
      {workspaceFromState?.invite_code && (
        <p className="muted-text" style={{ marginTop: 6 }}>Invite code: {workspaceFromState.invite_code}</p>
      )}

      {loadError && <p className="error-text">{loadError}</p>}

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
                  {m.email || m.user_id}
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
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SessionCard({ session }) {
  return (
    <Link to={`/sessions/${session.id}`} className="session-card">
      <div className="session-card-top">
        <strong>{session.name}</strong>
        <span className={`badge ${session.status === 'ended' ? 'badge-ended' : ''}`}>{session.status}</span>
      </div>
      <span className="session-card-link">Join board &rarr;</span>
    </Link>
  )
}
