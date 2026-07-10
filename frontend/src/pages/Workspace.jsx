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
        localStorage.removeItem('token')
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
        body: JSON.stringify({ name: sessionName.trim(), member_ids: selectedMemberIds }),
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
    <div style={{ padding: 20, textAlign: 'left' }}>
      <Link to="/">&larr; Back to workspaces</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>{workspaceFromState?.name || 'Workspace'}</h2>
        <Link to={`/workspace/${id}/dashboard`} state={{ workspace: workspaceFromState }}>
          Dashboard
        </Link>
      </div>
      {workspaceFromState?.invite_code && <p>Invite code: {workspaceFromState.invite_code}</p>}

      {loadError && <p style={{ color: 'red' }}>{loadError}</p>}

      <section style={{ marginTop: 24 }}>
        <h3>Start a retro session</h3>
        <form onSubmit={handleCreateSession}>
          <input
            placeholder="Session name"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
          />
          <div style={{ marginTop: 10 }}>
            <p style={{ margin: '4px 0' }}>Include members (you're always included):</p>
            {members.filter((m) => m.user_id !== currentUserId).map((m) => (
              <label key={m.user_id} style={{ display: 'block', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedMemberIds.includes(m.user_id)}
                  onChange={() => toggleMember(m.user_id)}
                  style={{ marginRight: 6 }}
                />
                {m.email || m.user_id}
              </label>
            ))}
          </div>
          <button type="submit" disabled={creating} style={{ marginTop: 10 }}>
            {creating ? 'Creating...' : 'Create session'}
          </button>
          {createError && <p style={{ color: 'red' }}>{createError}</p>}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Active sessions</h3>
        {loading && <p>Loading...</p>}
        {!loading && activeSessions.length === 0 && <p>No active sessions.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {activeSessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Past sessions</h3>
        {!loading && pastSessions.length === 0 && <p>No past sessions yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {pastSessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function SessionRow({ session }) {
  return (
    <li
      style={{
        padding: 12,
        border: '1px solid var(--border)',
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <strong>{session.name}</strong>
      <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text)' }}>({session.status})</span>
      <div style={{ marginTop: 6 }}>
        <Link to={`/sessions/${session.id}`}>Join board &rarr;</Link>
      </div>
    </li>
  )
}
