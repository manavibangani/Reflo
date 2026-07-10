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
        localStorage.removeItem('token')
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

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>
  if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>

  return (
    <div style={{ padding: 20, textAlign: 'left' }}>
      <Link to={`/workspace/${id}`} state={{ workspace: workspaceFromState }}>
        &larr; Back to workspace
      </Link>
      <h2>{workspaceFromState?.name ? `${workspaceFromState.name} — Dashboard` : 'Dashboard'}</h2>

      <section style={{ marginTop: 24 }}>
        <h3>Past sessions</h3>
        {pastSessions.length === 0 && <p>No sessions have ended yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {pastSessions.map((s) => (
            <li
              key={s.id}
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <strong>{s.name}</strong>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                {new Date(s.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Action items</h3>
        {actionItems.length === 0 && <p>No action items yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {actionItems.map((item) => (
            <li
              key={item.id}
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: item.resolved ? 0.6 : 1,
              }}
            >
              <div>
                <div style={{ textDecoration: item.resolved ? 'line-through' : 'none' }}>
                  {item.text}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>From: {item.session_name}</div>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={item.resolved}
                  onChange={() => toggleResolved(item)}
                  style={{ marginRight: 6 }}
                />
                Resolved
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>AI summaries</h3>
        {pastSessions.length === 0 && <p>No sessions have ended yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {pastSessions.map((s) => (
            <li
              key={s.id}
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <strong>{s.name}</strong>
              <p style={{ margin: '6px 0 0', color: s.summary ? 'inherit' : 'var(--text)' }}>
                {s.summary || 'No summary generated yet.'}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
