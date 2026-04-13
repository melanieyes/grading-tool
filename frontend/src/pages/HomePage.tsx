import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <main className="page-content">
      <section className="hero-panel compact-hero">
        <p className="eyebrow">Fulbright University Vietnam</p>
        <h1>Fulbright Grade Master</h1>
        <p className="hero-copy narrow">
          A cleaner workflow for question intake, rubric review, and submission grading.
        </p>

        <div className="hero-actions">
          <Link to="/intake" className="primary-link-btn">
            Start with Question Intake
          </Link>
          <Link to="/rubric" className="secondary-link-btn">
            Review Rubric
          </Link>
        </div>
      </section>

      <section className="feature-grid">
        <Link to="/intake" className="feature-card feature-link">
          <span className="feature-number">01</span>
          <h2>Question Intake</h2>
          <p>Add questions manually or upload a JSON file.</p>
        </Link>

        <Link to="/rubric" className="feature-card feature-link">
          <span className="feature-number">02</span>
          <h2>Rubric Review</h2>
          <p>Generate, revise, and approve the scoring guide.</p>
        </Link>

        <Link to="/grading" className="feature-card feature-link">
          <span className="feature-number">03</span>
          <h2>Submission Grading</h2>
          <p>Upload answers and preview scores with feedback.</p>
        </Link>
      </section>
    </main>
  )
}