import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, getCurrentUserId, WS_BASE_URL } from '../lib/api'

const STATUS_LABELS = {
  working: 'Working',
  break: 'Taking a break',
  done: 'Done',
}

function formatRemaining(seconds) {
  const clamped = Math.max(0, Math.floor(seconds))
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function FocusRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentUserId = getCurrentUserId()

  const [session, setSession] = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [wsError, setWsError] = useState(null)

  const [joinGoal, setJoinGoal] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

  const [remaining, setRemaining] = useState(0)

  const wsRef = useRef(null)

  async function loadSession() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch(`/focus-sessions/${id}`)
      if (res.status === 401) {
        sessionStorage.removeItem('token')
        navigate('/login')
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load focus session')
        return
      }
      const data = await res.json()
      setSession(data.session)
      setParticipants(data.participants)
      setJoinGoal(data.session.goal)
    } catch {
      setLoadError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const myParticipant = participants.find((p) => p.user_id === currentUserId) || null
  const isJoined = !!myParticipant
  const isActive = session?.status === 'active'
  const isCreator = session && session.created_by === currentUserId

  useEffect(() => {
    if (!isJoined || loading) return

    const token = sessionStorage.getItem('token')
    const ws = new WebSocket(`${WS_BASE_URL}/ws/focus/${id}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setWsError('Connection error')

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'sync') {
        setSession(msg.session)
        setParticipants(msg.participants)
      } else if (msg.type === 'participant_joined') {
        setParticipants((prev) =>
          prev.some((p) => p.id === msg.participant.id)
            ? prev.map((p) => (p.id === msg.participant.id ? msg.participant : p))
            : [...prev, msg.participant]
        )
      } else if (msg.type === 'status_updated') {
        setParticipants((prev) =>
          prev.map((p) => (p.id === msg.participant.id ? msg.participant : p))
        )
      } else if (msg.type === 'session_ended') {
        setSession(msg.session)
        setParticipants(msg.participants)
      } else if (msg.type === 'error') {
        setWsError(msg.message)
      }
    }

    return () => ws.close()
  }, [id, isJoined, loading])

  useEffect(() => {
    if (!session) return
    function tick() {
      const deadline = new Date(session.started_at).getTime() + session.duration_minutes * 60000
      setRemaining((deadline - Date.now()) / 1000)
    }
    tick()
    if (session.status !== 'active') return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    if (isCreator && isActive && remaining <= 0 && connected) {
      wsRef.current?.readyState === WebSocket.OPEN &&
        wsRef.current.send(JSON.stringify({ type: 'end_session' }))
    }
  }, [remaining, isCreator, isActive, connected])

  function sendMessage(payload) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!joinGoal.trim()) return
    setJoining(true)
    setJoinError(null)
    try {
      const res = await apiFetch(`/focus-sessions/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ goal: joinGoal.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setJoinError(err.detail || 'Failed to join session')
        return
      }
      await loadSession()
    } catch {
      setJoinError('Network error')
    } finally {
      setJoining(false)
    }
  }

  function handleStatusChange(status) {
    sendMessage({ type: 'update_status', status })
  }

  function handleMarkCompleted(completed) {
    sendMessage({ type: 'mark_completed', completed })
  }

  async function handleEndSession() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendMessage({ type: 'end_session' })
      return
    }
    try {
      const res = await apiFetch(`/focus-sessions/${id}/end`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSession(data.session)
        setParticipants(data.participants)
      }
    } catch {
      setWsError('Failed to end session')
    }
  }

  if (loading) return <div className="page">Loading...</div>
  if (loadError) return <div className="page error-text">{loadError}</div>

  return (
    <div className="page">
      <Link to={`/workspace/${session?.workspace_id}`} className="back-link">
        Back to workspace
      </Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h2 style={{ margin: 0 }}>{session?.goal}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isJoined && (
            <span className={`connection-status ${connected ? 'live' : 'offline'}`}>
              {connected ? 'Live' : 'Disconnected'}
            </span>
          )}
          {isJoined && isActive && (isCreator || remaining <= 0) && (
            <button onClick={handleEndSession} className="btn btn-secondary btn-sm">
              End session
            </button>
          )}
        </div>
      </div>
      <p className="muted-text" style={{ marginTop: 4 }}>
        Status: <span className={`badge ${isActive ? '' : 'badge-ended'}`}>{session?.status}</span>
        {' · '}
        {session?.duration_minutes} min session
      </p>
      {wsError && <p className="error-text">{wsError}</p>}

      {!isActive && (
        <div className="focus-complete-banner">
          <div className="focus-complete-title">Session complete</div>
          <p className="muted-text" style={{ marginTop: 4 }}>
            {participants.length} {participants.length === 1 ? 'person' : 'people'} joined &middot;{' '}
            {participants.filter((p) => p.completed).length} completed their goal
          </p>
        </div>
      )}

      {!isJoined && isActive && (
        <section className="section">
          <h3 className="section-title">Join this focus session</h3>
          <div className="card">
            <form onSubmit={handleJoin}>
              <div className="field">
                <label className="field-label">Your goal for this session</label>
                <input
                  className="input"
                  value={joinGoal}
                  onChange={(e) => setJoinGoal(e.target.value)}
                  placeholder="What will you focus on?"
                />
              </div>
              <button type="submit" disabled={joining} className="btn btn-primary">
                {joining ? 'Joining...' : 'Join session'}
              </button>
              {joinError && <p className="error-text">{joinError}</p>}
            </form>
          </div>
        </section>
      )}

      {!isJoined && !isActive && (
        <p className="muted-text" style={{ marginTop: 16, fontStyle: 'italic' }}>
          This focus session has ended.
        </p>
      )}

      {isJoined && isActive && (
        <section className="section">
          <div className="focus-timer">{formatRemaining(remaining)}</div>
          <div className="field" style={{ marginTop: 16 }}>
            <label className="field-label">Your status</label>
            <div className="focus-duration-row">
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`focus-duration-btn ${myParticipant?.status === key ? 'active' : ''}`}
                  onClick={() => handleStatusChange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {isJoined && !isActive && (
        <section className="section">
          <h3 className="section-title">Did you complete your goal?</h3>
          <div className="focus-duration-row">
            <button
              type="button"
              className={`focus-duration-btn ${myParticipant?.completed ? 'active' : ''}`}
              onClick={() => handleMarkCompleted(true)}
            >
              Yes, completed
            </button>
            <button
              type="button"
              className={`focus-duration-btn ${!myParticipant?.completed ? 'active' : ''}`}
              onClick={() => handleMarkCompleted(false)}
            >
              Not completed
            </button>
          </div>
        </section>
      )}

      <section className="section">
        <h3 className="section-title">
          {isActive ? `Participants (${participants.length})` : 'Session summary'}
        </h3>
        <div className="focus-participant-grid">
          {participants.map((p) => (
            <div key={p.id} className="focus-participant-card">
              <div className="focus-participant-top">
                <strong>{p.user_name || 'Member'}</strong>
                {!isActive ? (
                  <span className={`badge ${p.completed ? '' : 'badge-ended'}`}>
                    {p.completed ? 'Completed' : 'Not completed'}
                  </span>
                ) : (
                  <span className="badge">{STATUS_LABELS[p.status] || p.status}</span>
                )}
              </div>
              <p className="muted-text" style={{ marginTop: 6 }}>{p.goal}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
