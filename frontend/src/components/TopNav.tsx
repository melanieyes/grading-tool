import { NavLink } from 'react-router-dom'

export default function TopNav() {
  function handleRestart() {
    const ok = window.confirm(
      'Restart the tool? This will clear questions, rubrics, submissions, grading results, edits, decisions, and evaluation/calibration state across all pages. Your saved API settings will be kept.',
    )
    if (!ok) return

    const keysToRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key) continue
      if (key.startsWith('grading_')) keysToRemove.push(key)
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k))
    // Reload so every page re-mounts in its default state.
    window.location.assign('/')
  }

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
            Question Upload
          </NavLink>
          <NavLink to="/grading" className="nav-link">
            Submission Grading
          </NavLink>
          <NavLink to="/evaluation" className="nav-link">
            Evaluation
          </NavLink>
        </nav>

        <button
          type="button"
          className="cta-btn"
          onClick={handleRestart}
          title="Clear all questions, rubrics, submissions, and grading results across every page."
        >
          Restart
        </button>
      </div>
    </header>
  )
}