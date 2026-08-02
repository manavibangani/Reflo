import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiFetch, getCurrentUserId, WS_BASE_URL } from '../lib/api'
import { COLORS } from '../lib/colors'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '💡']

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
  const [openMenuCardId, setOpenMenuCardId] = useState(null)

  const wsRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!openMenuCardId) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuCardId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuCardId])

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
      } else if (msg.type === 'reaction_updated') {
        setCards((prev) =>
          prev.map((c) => (c.id === msg.card_id ? { ...c, reactions: msg.reactions } : c))
        )
      } else if (msg.type === 'card_deleted') {
        setCards((prev) => prev.filter((c) => c.id !== msg.card_id))
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

  function handleToggleReaction(cardId, emoji) {
    sendMessage({ type: 'toggle_reaction', card_id: cardId, emoji })
  }

  async function handleDeleteCard(cardId) {
    try {
      const res = await apiFetch(`/cards/${cardId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setWsError(err.detail || 'Failed to delete card')
      }
    } catch {
      setWsError('Failed to delete card')
    }
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

  if (loading) return <div className="page">Loading...</div>
  if (loadError) return <div className="page error-text">{loadError}</div>

  const isCreator = session && session.created_by === currentUserId
  const isActive = session && session.status === 'active'

  function colorLabel(c) {
    return session?.color_labels?.[c.value]?.trim() || c.label
  }

  return (
    <div className="page">
      <Link to="/" className="back-link">&larr; Back to workspaces</Link>
      <div className="page-header" style={{ marginTop: 10 }}>
        <h2 style={{ margin: 0 }}>{session?.name}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`connection-status ${connected ? 'live' : 'offline'}`}>
            {connected ? 'Live' : 'Disconnected'}
          </span>
          {isCreator && isActive && (
            <button onClick={handleEndSession} className="btn btn-secondary btn-sm">End session</button>
          )}
        </div>
      </div>
      <p className="muted-text" style={{ marginTop: 4 }}>
        Status: <span className={`badge ${isActive ? '' : 'badge-ended'}`}>{session?.status}</span>
      </p>
      {wsError && <p className="error-text">{wsError}</p>}

      {isActive ? (
        <form onSubmit={handleAddCard} className="board-toolbar">
          <input
            className="input"
            placeholder="Add a card..."
            value={cardText}
            onChange={(e) => setCardText(e.target.value)}
          />
          <select
            className="input"
            value={cardColor}
            onChange={(e) => setCardColor(e.target.value)}
            style={{ width: 'auto' }}
          >
            {COLORS.map((c) => {
              const customLabel = session?.color_labels?.[c.value]?.trim()
              const text = customLabel ? `${c.emoji} ${c.label} — ${customLabel}` : `${c.emoji} ${c.label}`
              return (
                <option key={c.value} value={c.value}>
                  {text}
                </option>
              )
            })}
          </select>
          <span
            title={colorLabel(COLORS.find((c) => c.value === cardColor))}
            className="color-swatch"
            style={{ background: cardColor, width: 16, height: 16 }}
          />
          <button type="submit" className="btn btn-primary">
            Add card
          </button>
        </form>
      ) : (
        <p className="muted-text" style={{ marginTop: 16, fontStyle: 'italic' }}>This session has ended.</p>
      )}

      <div className="board-grid">
        {cards.map((card) => {
          const hasVoted = currentUserId && card.votes?.includes(currentUserId)
          const isOwnCard = card.created_by === currentUserId
          const menuOpen = openMenuCardId === card.id
          return (
            <div key={card.id} className="retro-card" style={{ borderLeftColor: card.color }}>
              {isOwnCard && (
                <div
                  ref={menuOpen ? menuRef : null}
                  className="retro-card-menu-anchor"
                >
                  <button
                    onClick={() => setOpenMenuCardId(menuOpen ? null : card.id)}
                    aria-label="Card options"
                    className="retro-card-menu-btn"
                  >
                    ⋮
                  </button>
                  {menuOpen && (
                    <div className="retro-card-menu">
                      <button
                        onClick={() => {
                          setOpenMenuCardId(null)
                          handleDeleteCard(card.id)
                        }}
                      >
                        Delete card
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="retro-card-text">{card.text}</p>
              <button
                onClick={() => handleToggleVote(card.id)}
                disabled={!isActive}
                className={`vote-btn ${hasVoted ? 'voted' : ''}`}
              >
                {hasVoted ? 'Unvote' : 'Vote'} ({card.vote_count || 0})
              </button>
              <div className="reaction-row">
                {REACTION_EMOJIS.map((emoji) => {
                  const reactors = card.reactions?.[emoji] || []
                  const reacted = currentUserId && reactors.includes(currentUserId)
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`reaction-btn ${reacted ? 'reacted' : ''}`}
                      onClick={() => handleToggleReaction(card.id, emoji)}
                      disabled={!isActive}
                    >
                      <span>{emoji}</span>
                      {reactors.length > 0 && <span className="reaction-count">{reactors.length}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
