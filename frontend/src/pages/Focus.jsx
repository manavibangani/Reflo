import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'

const DURATION_PRESETS = [25, 45, 60, 90]

export default function Focus({ workspaceId, emptyDescription }) {
  const navigate = useNavigate()

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [goal, setGoal] = useState('')
  const [duration, setDuration] = useState(25)
  const [customDuration, setCustomDuration] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  async function loadSessions() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/focus-sessions`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load focus sessions')
        return
      }
      setSessions(await res.json())
    } catch {
      setLoadError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function handleCreate(e) {
    e.preventDefault()
    if (!goal.trim()) return
    const durationMinutes = duration === 'custom' ? Number(customDuration) : duration
    if (!durationMinutes || durationMinutes < 1) {
      setCreateError('Enter a valid duration')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/focus-sessions`, {
        method: 'POST',
        body: JSON.stringify({ goal: goal.trim(), duration_minutes: durationMinutes }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.detail || 'Failed to start focus session')
        return
      }
      const data = await res.json()
      navigate(`/focus-sessions/${data.session.id}`)
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  const activeSessions = sessions.filter((s) => s.status === 'active')
  const pastSessions = sessions.filter((s) => s.status !== 'active')
  const isEmpty = !loading && activeSessions.length === 0 && pastSessions.length === 0

  return (
    <div>
      {isEmpty && emptyDescription && <p className="tab-empty-description">{emptyDescription}</p>}
      {loadError && <p className="error-text">{loadError}</p>}

      <section className="section" style={{ marginTop: 20 }}>
        <h3 className="section-title">Start a focus session</h3>
        <div className="card">
          <form onSubmit={handleCreate}>
            <div className="field">
              <label className="field-label">Goal for this session</label>
              <input
                className="input"
                placeholder="e.g. Finishing the auth module"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Duration</label>
              <div className="focus-duration-row">
                {DURATION_PRESETS.map((mins) => (
                  <button
                    type="button"
                    key={mins}
                    className={`focus-duration-btn ${duration === mins ? 'active' : ''}`}
                    onClick={() => setDuration(mins)}
                  >
                    {mins} min
                  </button>
                ))}
                <button
                  type="button"
                  className={`focus-duration-btn ${duration === 'custom' ? 'active' : ''}`}
                  onClick={() => setDuration('custom')}
                >
                  Custom
                </button>
                {duration === 'custom' && (
                  <input
                    className="input"
                    style={{ width: 100 }}
                    type="number"
                    min="1"
                    placeholder="Minutes"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                  />
                )}
              </div>
            </div>
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Starting...' : 'Start focus session'}
            </button>
            {createError && <p className="error-text">{createError}</p>}
          </form>
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Active focus sessions</h3>
        {loading && <p className="muted-text">Loading...</p>}
        {!loading && activeSessions.length === 0 && (
          <p className="empty-text">No one is in a focus session right now.</p>
        )}
        <div className="session-card-grid">
          {activeSessions.map((s) => (
            <FocusSessionCard key={s.id} session={s} />
          ))}
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Past focus sessions</h3>
        {!loading && pastSessions.length === 0 && <p className="empty-text">No past focus sessions yet.</p>}
        <div className="session-card-grid">
          {pastSessions.map((s) => (
            <FocusSessionCard key={s.id} session={s} />
          ))}
        </div>
      </section>
    </div>
  )
}

function FocusSessionCard({ session }) {
  const navigate = useNavigate()
  return (
    <div
      className="session-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/focus-sessions/${session.id}`)}
    >
      <div className="session-card-top">
        <strong>{session.goal}</strong>
        <span className={`badge ${session.status === 'ended' ? 'badge-ended' : ''}`}>{session.status}</span>
      </div>
      <span className="muted-text">
        {session.duration_minutes} min &middot; {session.participants?.length || 0} joined
      </span>
      <span className="session-card-link">
        {session.status === 'active' ? 'Join session' : 'View summary'}
      </span>
    </div>
  )
}
