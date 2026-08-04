import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API_BASE_URL = 'http://127.0.0.1:8000'

export default function Login(){
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function submit(e){
    e.preventDefault()
    setError(null)
    try{
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if(!res.ok){
        const err = await res.json()
        setError(err.detail || 'Login failed')
        return
      }
      const data = await res.json()
      sessionStorage.setItem('token', data.access_token)
      sessionStorage.setItem('name', data.name || '')
      navigate('/')
    }catch(err){
      setError('Network error')
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-subtitle">Log in to continue to your workspaces</p>
        <form onSubmit={submit}>
          <div className="field">
            <label className="field-label">Email</label>
            <input
              className="input"
              value={email}
              onChange={e=>setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary auth-submit">Login</button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <p className="auth-footer">
          New here? <Link to="/signup">Sign up →</Link>
        </p>
      </div>
    </div>
  )
}
