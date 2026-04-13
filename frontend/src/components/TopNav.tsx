import { NavLink } from 'react-router-dom'

export default function TopNav() {
  return (
    <header className="top-nav">
      <div className="nav-inner">
        <NavLink to="/" className="brand">
          Fulbright Grade Master
        </NavLink>

        <nav className="main-nav" aria-label="Primary">
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

        <NavLink to="/intake" className="nav-cta">
          Start Grading
        </NavLink>
      </div>
    </header>
  )
}