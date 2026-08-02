import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, getCurrentUserEmail } from '../lib/api'

function CreateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
      <path d="M13 8.5l4 3.5-4 3.5" />
      <path d="M17 12H4" />
    </svg>
  )
}

export default function Home() {
  const navigate = useNavigate()
  const email = getCurrentUserEmail()

  const [workspaceName, setWorkspaceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

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
      if (res.status === 401) {
        sessionStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setCreateError(err.detail || 'Failed to create workspace')
        return
      }
      const workspace = await res.json()
      setWorkspaceName('')
      navigate(`/workspace/${workspace.id}`, { state: { workspace } })
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
      if (res.status === 401) {
        sessionStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setJoinError(err.detail || 'Failed to join workspace')
        return
      }
      const workspace = await res.json()
      setInviteCode('')
      navigate(`/workspace/${workspace.id}`, { state: { workspace } })
    } catch {
      setJoinError('Network error')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="page page-home">
      <div className="home-grid">
        <div className="home-panel home-panel-create">
          <div className="home-panel-icon">
            <CreateIcon />
          </div>
          <h3 className="home-panel-title">Create a workspace</h3>
          <p className="home-panel-subtitle">Spin up a fresh space for your team's retros.</p>
          <form onSubmit={handleCreate} className="home-panel-form">
            <input
              className="input"
              placeholder="Workspace name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? 'Creating...' : 'Create workspace'}
            </button>
          </form>
          {createError && <p className="error-text">{createError}</p>}
        </div>

        <div className="home-panel home-panel-join">
          <div className="home-panel-icon home-panel-icon-alt">
            <JoinIcon />
          </div>
          <h3 className="home-panel-title">Join a workspace</h3>
          <p className="home-panel-subtitle">Got an invite code? Drop it in below.</p>
          <form onSubmit={handleJoin} className="home-panel-form">
            <input
              className="input"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
            <button type="submit" disabled={joining} className="btn btn-secondary">
              {joining ? 'Joining...' : 'Join workspace'}
            </button>
          </form>
          {joinError && <p className="error-text">{joinError}</p>}
        </div>
      </div>

      <p className="home-greeting">Welcome back, {email}</p>
    </div>
  )
}
