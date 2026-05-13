import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <main className="shell home-page">
      <section className="hero-card">
        <div className="hero-left">
          <p className="eyebrow">Fulbright University Vietnam</p>

          <h1 className="hero-title" style={{ whiteSpace: 'nowrap' }}>Grading tool for reasoning work.</h1>

          <p className="hero-copy">
            Upload submissions, apply rubric-aligned grading, and review uncertain cases before releasing feedback.
          </p>

          <div className="hero-actions">
            <Link to="/grading" className="primary-btn">
              Start grading
            </Link>
            <Link to="/intake" className="ghost-btn hero-secondary-btn">
              Question upload & rubric
            </Link>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-stat">
            <span>Workflow</span>
            <strong>Question → Rubric → Grade</strong>
          </div>

          <div className="hero-stat">
            <span>Review</span>
            <strong>Flag uncertain answers</strong>
          </div>

          <div className="hero-stat">
            <span>Feedback</span>
            <strong>Score + explanation</strong>
          </div>
        </div>
      </section>

      <section className="workflow-section">
        <div className="section-intro">
          <p className="eyebrow">Workflow</p>
          <h2>A cleaner path from intake to feedback</h2>
        </div>

        <div className="workflow-grid">
          <Link to="/intake" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">01</span>
              <span className="step-line" />
            </div>
            <h3>Question Upload</h3>
            <p>Upload questions and generate a rubric in one page.</p>
          </Link>

          <Link to="/grading" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">02</span>
              <span className="step-line" />
            </div>
            <h3>Submission Grading</h3>
            <p>Run batch grading and inspect answers that need human review.</p>
          </Link>

          <Link to="/evaluation" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">03</span>
              <span className="step-line" />
            </div>
            <h3>Evaluation</h3>
            <p>Compare AI vs professor grades and calibrate to reduce MSE.</p>
          </Link>
        </div>
      </section>
    </main>
  )
}
