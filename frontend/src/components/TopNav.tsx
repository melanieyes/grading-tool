import { NavLink } from 'react-router-dom'

export default function TopNav() {
  return (
    <header className="top-nav">
      <div className="shell nav-shell">
        <NavLink to="/" className="brand">
          <span className="brand-mark" />
          <div className="brand-copy">
            <strong>Fulbright Grade Master</strong>
            <small>AI-assisted grading platform</small>
          </div>
        </NavLink>

        <nav className="nav-links">
          <NavLink to="/intake" className="nav-link">
            Question Intake
          </NavLink>
          <NavLink to="/rubric" className="nav-link">
            Rubric Review
          </NavLink>
          <NavLink to="/grading" className="nav-link">
            Submission Grading
          </NavLink>
        </nav>

        <NavLink to="/grading" className="cta-btn">
          Start Grading
        </NavLink>
      </div>
    </header>
  )
}