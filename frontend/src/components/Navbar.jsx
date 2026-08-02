import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, getCurrentUserEmail } from '../lib/api'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.4 4.4l1.8 1.8M17.8 17.8l1.8 1.8M2.5 12H5M19 12h2.5M4.4 19.6l1.8-1.8M17.8 6.2l1.8-1.8" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.7 14.9A8.4 8.4 0 1 1 9.1 3.3a.6.6 0 0 1 .7.9 7 7 0 0 0 9 9 .6.6 0 0 1 .9.7Z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.6-3.6 4.4-5.4 7.5-5.4s5.9 1.8 7.5 5.4" />
    </svg>
  )
}

export default function Navbar({ theme, onToggleTheme }) {
  const navigate = useNavigate()
  const token = sessionStorage.getItem('token')
  const isLoggedIn = Boolean(token)
  const email = isLoggedIn ? getCurrentUserEmail() : null

  const [menuOpen, setMenuOpen] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function openMenu() {
    const next = !menuOpen
    setMenuOpen(next)
    if (next && isLoggedIn) {
      setLoadingWorkspaces(true)
      try {
        const res = await apiFetch('/workspaces')
        if (res.ok) setWorkspaces(await res.json())
      } catch {
        // ignore — dropdown just shows no workspaces
      } finally {
        setLoadingWorkspaces(false)
      }
    }
  }

  function logout() {
    sessionStorage.removeItem('token')
    setMenuOpen(false)
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <Link to={isLoggedIn ? '/' : '/login'} className="navbar-brand">
        Reflo
      </Link>
      <div className="navbar-right">
        {isLoggedIn ? (
          <div className="avatar-menu" ref={menuRef}>
            <button
              type="button"
              className="avatar-btn"
              onClick={openMenu}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <PersonIcon />
            </button>
            {menuOpen && (
              <div className="avatar-dropdown">
                <div className="avatar-dropdown-email">{email}</div>
                <div className="avatar-dropdown-section-label">Workspaces</div>
                <div className="avatar-dropdown-workspaces">
                  {loadingWorkspaces && <div className="avatar-dropdown-empty">Loading...</div>}
                  {!loadingWorkspaces && workspaces.length === 0 && (
                    <div className="avatar-dropdown-empty">No workspaces yet</div>
                  )}
                  {!loadingWorkspaces &&
                    workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        className="avatar-dropdown-workspace"
                        onClick={() => {
                          setMenuOpen(false)
                          navigate(`/workspace/${ws.id}`, { state: { workspace: ws } })
                        }}
                      >
                        {ws.name}
                      </button>
                    ))}
                </div>
                <div className="avatar-dropdown-divider" />
                <button type="button" className="avatar-dropdown-logout" onClick={logout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="navbar-links">
            <Link to="/login" className="navbar-link">Login</Link>
            <Link to="/signup" className="navbar-link">Signup</Link>
          </div>
        )}
        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </nav>
  )
}
