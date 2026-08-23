import { useEffect, useState } from 'react'
import { apiFetch, getCurrentUserId } from '../lib/api'

export default function Standup({ workspaceId, emptyDescription }) {
  const currentUserId = getCurrentUserId()

  const [view, setView] = useState('today')
  const [standups, setStandups] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const [yesterdayField, setYesterdayField] = useState('')
  const [todayField, setTodayField] = useState('')
  const [blockersField, setBlockersField] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const myStandup = standups.find((s) => s.user_id === currentUserId) || null

  async function loadToday() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/standups`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load standups')
        return
      }
      setStandups(await res.json())
    } catch {
      setLoadError('Network error')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    setLoadError(null)
    try {
      const res = await apiFetch(`/workspaces/${workspaceId}/standups/history`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setLoadError(err.detail || 'Failed to load standup history')
        return
      }
      setHistory(await res.json())
      setHistoryLoaded(true)
    } catch {
      setLoadError('Network error')
    }
  }

  useEffect(() => {
    loadToday()
    setHistoryLoaded(false)
    setHistory([])
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (view === 'history' && !historyLoaded) {
      loadHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function startEdit() {
    if (myStandup) {
      setYesterdayField(myStandup.yesterday)
      setTodayField(myStandup.today)
      setBlockersField(myStandup.blockers)
    }
    setFormError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setFormError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!yesterdayField.trim() || !todayField.trim()) return
    setSaving(true)
    setFormError(null)
    try {
      const body = JSON.stringify({
        yesterday: yesterdayField.trim(),
        today: todayField.trim(),
        blockers: blockersField.trim(),
      })
      const res = myStandup
        ? await apiFetch(`/standups/${myStandup.id}`, { method: 'PUT', body })
        : await apiFetch(`/workspaces/${workspaceId}/standups`, { method: 'POST', body })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setFormError(err.detail || 'Failed to save standup')
        return
      }
      setYesterdayField('')
      setTodayField('')
      setBlockersField('')
      setEditing(false)
      await loadToday()
    } catch {
      setFormError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const isEmpty = !loading && standups.length === 0

  return (
    <div>
      {isEmpty && emptyDescription && <p className="tab-empty-description">{emptyDescription}</p>}
      <div className="tab-subnav">
        <button
          className={`tab-subnav-btn ${view === 'today' ? 'active' : ''}`}
          onClick={() => setView('today')}
        >
          Today
        </button>
        <button
          className={`tab-subnav-btn ${view === 'history' ? 'active' : ''}`}
          onClick={() => setView('history')}
        >
          History
        </button>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}

      {view === 'today' && (
        <>
          <section className="section" style={{ marginTop: 20 }}>
            <h3 className="section-title">{myStandup ? 'Your standup' : "Post today's standup"}</h3>
            {myStandup && !editing ? (
              <div className="standup-card standup-card-own">
                <StandupFields standup={myStandup} />
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={startEdit}>
                  Edit standup
                </button>
              </div>
            ) : (
              <div className="card">
                <form onSubmit={handleSubmit}>
                  <div className="field">
                    <label className="field-label">What did you work on yesterday?</label>
                    <textarea
                      className="input textarea"
                      value={yesterdayField}
                      onChange={(e) => setYesterdayField(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">What are you working on today?</label>
                    <textarea
                      className="input textarea"
                      value={todayField}
                      onChange={(e) => setTodayField(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Any blockers?</label>
                    <textarea
                      className="input textarea"
                      value={blockersField}
                      onChange={(e) => setBlockersField(e.target.value)}
                      rows={2}
                      placeholder="None"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" disabled={saving} className="btn btn-primary">
                      {saving ? 'Saving...' : myStandup ? 'Save changes' : 'Post standup'}
                    </button>
                    {editing && (
                      <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                        Cancel
                      </button>
                    )}
                  </div>
                  {formError && <p className="error-text">{formError}</p>}
                </form>
              </div>
            )}
          </section>

          <section className="section">
            <h3 className="section-title">Today's standups</h3>
            {loading && <p className="muted-text">Loading...</p>}
            {!loading && standups.length === 0 && (
              <p className="empty-text">No one has posted a standup today yet.</p>
            )}
            <div className="standup-grid">
              {standups.map((s) => (
                <div key={s.id} className="standup-card">
                  <strong>{s.user_name || 'Member'}</strong>
                  <StandupFields standup={s} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {view === 'history' && (
        <section className="section" style={{ marginTop: 20 }}>
          <h3 className="section-title">Standup history</h3>
          {history.length === 0 && <p className="empty-text">No past standups yet.</p>}
          {history.map((group) => (
            <div key={group.date} className="standup-history-group">
              <div className="standup-history-date">
                {new Date(group.date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              <div className="standup-grid">
                {group.standups.map((s) => (
                  <div key={s.id} className="standup-card">
                    <strong>{s.user_name || 'Member'}</strong>
                    <StandupFields standup={s} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function StandupFields({ standup }) {
  return (
    <div className="standup-fields">
      <div>
        <span className="standup-field-label">Yesterday</span>
        <p>{standup.yesterday}</p>
      </div>
      <div>
        <span className="standup-field-label">Today</span>
        <p>{standup.today}</p>
      </div>
      <div>
        <span className="standup-field-label">Blockers</span>
        <p className={!standup.blockers ? 'muted-text' : ''}>{standup.blockers || 'None'}</p>
      </div>
    </div>
  )
}
