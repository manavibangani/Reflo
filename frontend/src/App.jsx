import './App.css'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
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

function App() {
  return (
    <Router>
      <nav style={{padding:10}}>
        <Link to="/" style={{marginRight:8}}>Home</Link>
        <Link to="/login" style={{marginRight:8}}>Login</Link>
        <Link to="/signup">Signup</Link>
      </nav>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/workspace/:id" element={<RequireAuth><Workspace /></RequireAuth>} />
        <Route path="/workspace/:id/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/sessions/:id" element={<RequireAuth><SessionBoard /></RequireAuth>} />
      </Routes>
    </Router>
  )
}

export default App
