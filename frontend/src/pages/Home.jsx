import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'

export default function Home() {
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [workspaceName, setWorkspaceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

  const navigate = useNavigate()

  async function loadWorkspaces() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch('/workspaces')
      if (res.status === 401) {
        localStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load workspaces')
        return
      }
      setWorkspaces(await res.json())
    } catch {
      setLoadError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!workspaceName.trim()) return
    setCreateError(null)
    setCreating(true)
    try {
      const res = await apiFetch('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: workspaceName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.detail || 'Failed to create workspace')
        return
      }
      setWorkspaceName('')
      await loadWorkspaces()
    } catch {
      setCreateError('Network error')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setJoinError(null)
    setJoining(true)
    try {
      const res = await apiFetch('/workspaces/join', {
        method: 'POST',
        body: JSON.stringify({ invite_code: inviteCode.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setJoinError(err.detail || 'Failed to join workspace')
        return
      }
      setInviteCode('')
      await loadWorkspaces()
    } catch {
      setJoinError('Network error')
    } finally {
      setJoining(false)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={{ padding: 20, textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Your Workspaces</h2>
        <button onClick={logout}>Logout</button>
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>Create a workspace</h3>
        <form onSubmit={handleCreate}>
          <input
            placeholder="Workspace name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
          <button type="submit" disabled={creating} style={{ marginLeft: 8 }}>
            {creating ? 'Creating...' : 'Create'}
          </button>
          {createError && <p style={{ color: 'red' }}>{createError}</p>}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Join a workspace</h3>
        <form onSubmit={handleJoin}>
          <input
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
          />
          <button type="submit" disabled={joining} style={{ marginLeft: 8 }}>
            {joining ? 'Joining...' : 'Join'}
          </button>
          {joinError && <p style={{ color: 'red' }}>{joinError}</p>}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Your workspaces</h3>
        {loading && <p>Loading...</p>}
        {loadError && <p style={{ color: 'red' }}>{loadError}</p>}
        {!loading && !loadError && workspaces.length === 0 && (
          <p>You are not part of any workspace yet.</p>
        )}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {workspaces.map((ws) => (
            <li
              key={ws.id}
              onClick={() => navigate(`/workspace/${ws.id}`, { state: { workspace: ws } })}
              style={{
                padding: 12,
                border: '1px solid var(--border)',
                borderRadius: 6,
                marginBottom: 8,
                cursor: 'pointer',
              }}
            >
              <strong>{ws.name}</strong>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>Invite code: {ws.invite_code}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
