import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'

const SUMMARY_SECTIONS = [
  { key: 'wentWell', label: 'What went well', match: /^what went well:?$/i, tone: 'good' },
  { key: 'didntGoWell', label: "What didn't go well", match: /^what didn't go well:?$/i, tone: 'bad' },
  { key: 'actionItems', label: 'Key action items', match: /^key action items:?$/i, tone: 'action' },
]

function parseSummary(text) {
  if (!text) return null
  const sections = { wentWell: [], didntGoWell: [], actionItems: [] }
  let current = null
  let matchedAny = false

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const hit = SUMMARY_SECTIONS.find((s) => s.match.test(line))
    if (hit) {
      current = hit.key
      matchedAny = true
      continue
    }
    if (!current) continue
    const bullet = line.replace(/^-+\s*/, '').trim()
    if (bullet && bullet.toLowerCase() !== 'nothing noted') {
      sections[current].push(bullet)
    }
  }

  return matchedAny ? sections : null
}

export default function Dashboard() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const workspaceFromState = state?.workspace

  const [pastSessions, setPastSessions] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [focusSessions, setFocusSessions] = useState([])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/workspaces/${id}/dashboard`)
      if (res.status === 401) {
        sessionStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Failed to load dashboard')
        return
      }
      const data = await res.json()
      setPastSessions(data.past_sessions)
      setActionItems(data.action_items)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function loadFocusSessions() {
    try {
      const res = await apiFetch(`/workspaces/${id}/focus-sessions`)
      if (res.ok) {
        setFocusSessions(await res.json())
      }
    } catch {
      // Focus history is a secondary panel; ignore failures here.
    }
  }

  useEffect(() => {
    loadFocusSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function toggleResolved(item) {
    const nextResolved = !item.resolved
    setActionItems((prev) =>
      prev.map((a) => (a.id === item.id ? { ...a, resolved: nextResolved } : a))
    )
    try {
      const res = await apiFetch(`/cards/${item.id}/resolved`, {
        method: 'PATCH',
        body: JSON.stringify({ resolved: nextResolved }),
      })
      if (!res.ok) {
        setActionItems((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, resolved: item.resolved } : a))
        )
      }
    } catch {
      setActionItems((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, resolved: item.resolved } : a))
      )
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (error) return <div className="page error-text">{error}</div>

  return (
    <div className="page">
      <Link to={`/workspace/${id}`} state={{ workspace: workspaceFromState }} className="back-link">
        Back to workspace
      </Link>
      <h2 style={{ marginTop: 10 }}>
        {workspaceFromState?.name ? `${workspaceFromState.name} — Dashboard` : 'Dashboard'}
      </h2>

      <section className="section">
        <h3 className="section-title">Past sessions</h3>
        {pastSessions.length === 0 && <p className="empty-text">No sessions have ended yet.</p>}
        <div className="dash-grid">
          {pastSessions.map((s) => (
            <div key={s.id} className="dash-card">
              <strong>{s.name}</strong>
              <div className="muted-text" style={{ marginTop: 4 }}>
                {new Date(s.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h3 className="section-title">Action items</h3>
        {actionItems.length === 0 && <p className="empty-text">No action items yet.</p>}
        <div className="dash-grid">
          {actionItems.map((item) => (
            <div key={item.id} className={`dash-card action-item ${item.resolved ? 'resolved' : ''}`}>
              <div>
                <div className={item.resolved ? 'action-item-text resolved' : ''}>
                  {item.text}
                </div>
                <div className="muted-text" style={{ marginTop: 4 }}>From: {item.session_name}</div>
              </div>
              <label className="checkbox-row" style={{ marginBottom: 0 }}>
                <input
                  type="checkbox"
                  checked={item.resolved}
                  onChange={() => toggleResolved(item)}
                />
                Resolved
              </label>
            </div>
          ))}
        </div>
      </section>

      {pastSessions.some((s) => s.summary) && (
        <section className="section">
          <h3 className="section-title">AI summaries</h3>
          <div className="dash-grid">
            {pastSessions
              .filter((s) => s.summary)
              .map((s) => {
                const parsed = parseSummary(s.summary)
                return (
                  <div key={s.id} className="dash-card">
                    <strong>{s.name}</strong>
                    {parsed ? (
                      <div className="ai-summary">
                        {SUMMARY_SECTIONS.map(
                          (section) =>
                            parsed[section.key].length > 0 && (
                              <div key={section.key} className={`ai-summary-block ai-summary-block-${section.tone}`}>
                                <div className={`ai-summary-label ai-summary-label-${section.tone}`}>
                                  {section.label}
                                </div>
                                <ul className="ai-summary-list">
                                  {parsed[section.key].map((line, i) => (
                                    <li key={i}>{line}</li>
                                  ))}
                                </ul>
                              </div>
                            )
                        )}
                      </div>
                    ) : (
                      <p className="summary-text">{s.summary}</p>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      )}

      <section className="section">
        <h3 className="section-title">Focus sessions</h3>
        {focusSessions.length === 0 && <p className="empty-text">No focus sessions yet.</p>}
        <div className="dash-grid">
          {focusSessions.map((s) => {
            const completedCount = (s.participants || []).filter((p) => p.completed).length
            return (
              <Link
                key={s.id}
                to={`/focus-sessions/${s.id}`}
                className="dash-card card-clickable"
                style={{ color: 'var(--text-strong)', textDecoration: 'none', display: 'block' }}
              >
                <strong>{s.goal}</strong>
                <div className="muted-text" style={{ marginTop: 4 }}>
                  {s.duration_minutes} min &middot; {(s.participants || []).length} joined &middot;{' '}
                  {completedCount} completed
                </div>
                <div className="muted-text" style={{ marginTop: 4 }}>
                  <span className={`badge ${s.status === 'ended' ? 'badge-ended' : ''}`}>{s.status}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
