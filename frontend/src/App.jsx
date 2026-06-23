import './App.css'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Login from './pages/Login'
import Signup from './pages/Signup'

function App() {
  return (
    <Router>
      <nav style={{padding:10}}>
        <Link to="/login" style={{marginRight:8}}>Login</Link>
        <Link to="/signup">Signup</Link>
      </nav>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/" element={<div style={{padding:20}}>Welcome to Reflo</div>} />
      </Routes>
    </Router>
  )
}

export default App
