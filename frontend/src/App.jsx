import { useEffect, useState } from 'react'
import './App.css'
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Home from './pages/Home'
import Workspace from './pages/Workspace'
import SessionBoard from './pages/SessionBoard'
import Dashboard from './pages/Dashboard'

function RequireAuth({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function getInitialTheme() {
  const stored = localStorage.getItem('reflo-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

function AppShell({ theme, onToggleTheme }) {
  // useLocation ties this component's render to client-side navigation, so the
  // navbar re-reads sessionStorage (and refreshes the auth-dependent UI) right
  // after login/logout redirects without needing a full page reload.
  useLocation()

  return (
    <>
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/workspace/:id" element={<RequireAuth><Workspace /></RequireAuth>} />
        <Route path="/workspace/:id/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/sessions/:id" element={<RequireAuth><SessionBoard /></RequireAuth>} />
      </Routes>
    </>
  )
}

function App() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('reflo-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <Router>
      <AppShell theme={theme} onToggleTheme={toggleTheme} />
    </Router>
  )
}

export default App
