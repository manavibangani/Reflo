import { useEffect, useState } from 'react'
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'

export default function Dashboard() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const workspaceFromState = state?.workspace

  const [pastSessions, setPastSessions] = useState([])
  const [actionItems, setActionItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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
        &larr; Back to workspace
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

      <section className="section">
        <h3 className="section-title">AI summaries</h3>
        {pastSessions.length === 0 && <p className="empty-text">No sessions have ended yet.</p>}
        <div className="dash-grid">
          {pastSessions.map((s) => (
            <div key={s.id} className="dash-card">
              <strong>{s.name}</strong>
              <p className={s.summary ? 'summary-text' : 'summary-text muted-text'}>
                {s.summary || 'No summary generated yet.'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
