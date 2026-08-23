import { Link } from 'react-router-dom'

function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M8.5 4.5v15M15.5 4.5v15" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16v11H9.5L5.5 20v-3.5H4v-11Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

const FEATURES = [
  {
    icon: <BoardIcon />,
    title: 'Retro',
    description: 'Reflect on your sprint together — add cards, vote on what matters, and turn insights into action items.',
  },
  {
    icon: <ChatIcon />,
    title: 'Standup',
    description: "Post a quick async check-in each day — yesterday, today, blockers — so your team stays in sync without a meeting.",
  },
  {
    icon: <TargetIcon />,
    title: 'Focus',
    description: 'Start a shared focus session with a goal and a timer, work alongside your team, and see who hits their goal.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <span className="landing-eyebrow">For teams that ship</span>
        <h1 className="landing-title">
          Retros, standups, and focus time —<br /> all in one place.
        </h1>
        <p className="landing-subtitle">
          Reflo is a lightweight home base for how your team reflects, checks in, and does deep work
          together. No meetings required.
        </p>
        <div className="landing-cta-row">
          <Link to="/signup" className="btn btn-primary btn-lg">Get started</Link>
          <Link to="/login" className="btn btn-secondary btn-lg">Log in</Link>
        </div>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="landing-feature-card">
            <div className="home-panel-icon">{f.icon}</div>
            <h3 className="home-panel-title">{f.title}</h3>
            <p className="landing-feature-desc">{f.description}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
