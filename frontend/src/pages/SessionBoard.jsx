import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, getCurrentUserId, WS_BASE_URL } from '../lib/api'

const COLORS = [
  { value: '#fef08a', label: 'Yellow' },
  { value: '#bbf7d0', label: 'Green' },
  { value: '#fecaca', label: 'Red' },
  { value: '#bfdbfe', label: 'Blue' },
  { value: '#e9d5ff', label: 'Purple' },
]

export default function SessionBoard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentUserId = getCurrentUserId()

  const [session, setSession] = useState(null)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [wsError, setWsError] = useState(null)

  const [cardText, setCardText] = useState('')
  const [cardColor, setCardColor] = useState(COLORS[0].value)

  const wsRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await apiFetch(`/sessions/${id}`)
        if (res.status === 401) {
          sessionStorage.removeItem('token')
          navigate('/login')
          return
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setLoadError(err.detail || 'Failed to load session')
          return
        }
        const data = await res.json()
        if (cancelled) return
        setSession(data.session)
        setCards(data.cards)
      } catch {
        if (!cancelled) setLoadError('Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  useEffect(() => {
    if (loading || loadError) return

    const token = sessionStorage.getItem('token')
    const ws = new WebSocket(`${WS_BASE_URL}/ws/sessions/${id}?token=${encodeURIComponent(token)}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setWsError('Connection error')

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'card_added') {
        setCards((prev) => (prev.some((c) => c.id === msg.card.id) ? prev : [...prev, msg.card]))
      } else if (msg.type === 'vote_updated') {
        setCards((prev) =>
          prev.map((c) =>
            c.id === msg.card_id ? { ...c, votes: msg.votes, vote_count: msg.vote_count } : c
          )
        )
      } else if (msg.type === 'session_ended') {
        setSession(msg.session)
      } else if (msg.type === 'error') {
        setWsError(msg.message)
      }
    }

    return () => ws.close()
  }, [id, loading, loadError])

  function sendMessage(payload) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }

  function handleAddCard(e) {
    e.preventDefault()
    if (!cardText.trim()) return
    sendMessage({ type: 'add_card', text: cardText.trim(), color: cardColor })
    setCardText('')
  }

  function handleToggleVote(cardId) {
    sendMessage({ type: 'toggle_vote', card_id: cardId })
  }

  async function handleEndSession() {
    try {
      const res = await apiFetch(`/sessions/${id}/end`, { method: 'POST' })
      if (res.ok) {
        setSession(await res.json())
      }
    } catch {
      setWsError('Failed to end session')
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Loading...</div>
  if (loadError) return <div style={{ padding: 20, color: 'red' }}>{loadError}</div>

  const isCreator = session && session.created_by === currentUserId
  const isActive = session && session.status === 'active'

  return (
    <div style={{ padding: 20, textAlign: 'left' }}>
      <Link to="/">&larr; Back to workspaces</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>{session?.name}</h2>
        <div>
          <span style={{ marginRight: 12, fontSize: 13, color: connected ? 'green' : 'red' }}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
          {isCreator && isActive && <button onClick={handleEndSession}>End session</button>}
        </div>
      </div>
      <p style={{ color: 'var(--text)' }}>Status: {session?.status}</p>
      {wsError && <p style={{ color: 'red' }}>{wsError}</p>}

      {isActive ? (
        <form onSubmit={handleAddCard} style={{ marginTop: 16 }}>
          <input
            placeholder="Add a card..."
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
            style={{ width: 280 }}
          />
          {COLORS.map((c) => (
            <label key={c.value} style={{ marginLeft: 10 }}>
              <input
                type="radio"
                name="color"
                checked={cardColor === c.value}
                onChange={() => setCardColor(c.value)}
              />
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  background: c.value,
                  borderRadius: 3,
                  marginLeft: 4,
                  verticalAlign: 'middle',
                }}
              />
            </label>
          ))}
          <button type="submit" style={{ marginLeft: 12 }}>
            Add card
          </button>
        </form>
      ) : (
        <p style={{ marginTop: 16, fontStyle: 'italic' }}>This session has ended.</p>
      )}

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {cards.map((card) => {
          const hasVoted = currentUserId && card.votes?.includes(currentUserId)
          return (
            <div
              key={card.id}
              style={{
                background: card.color,
                borderRadius: 8,
                padding: 12,
                width: 200,
                boxSizing: 'border-box',
                color: '#1a1a1a',
              }}
            >
              <p style={{ margin: 0, wordBreak: 'break-word' }}>{card.text}</p>
              <button
                onClick={() => handleToggleVote(card.id)}
                disabled={!isActive}
                style={{ marginTop: 10, fontWeight: hasVoted ? 'bold' : 'normal' }}
              >
                {hasVoted ? 'Unvote' : 'Vote'} ({card.vote_count || 0})
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
