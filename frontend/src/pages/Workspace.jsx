import { useParams, useLocation, Link } from 'react-router-dom'

export default function Workspace() {
  const { id } = useParams()
  const { state } = useLocation()
  const workspace = state?.workspace

  return (
    <div style={{ padding: 20, textAlign: 'left' }}>
      <Link to="/">&larr; Back to workspaces</Link>
      <h2>{workspace?.name || 'Workspace'}</h2>
      {workspace?.invite_code && <p>Invite code: {workspace.invite_code}</p>}
      <p style={{ color: 'var(--text)' }}>Workspace ID: {id}</p>
      <p>Retro sessions and the dashboard are coming soon.</p>
    </div>
  )
}
