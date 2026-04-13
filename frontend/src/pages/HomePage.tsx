import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <main className="shell home-page">
      <section className="hero-card">
        <div className="hero-left">
          <p className="eyebrow">Fulbright University Vietnam</p>

          <h1 className="hero-title">
            Clearer grading for reasoning work.
          </h1>

          <p className="hero-copy">
            Intake questions, refine the rubric, and review flagged submissions
            in one calm workflow.
          </p>

          <div className="hero-actions">
            <Link to="/intake" className="primary-btn">
              Start grading
            </Link>

            <Link to="/rubric" className="ghost-btn">
              Review rubric
            </Link>
          </div>
        </div>

        <div className="hero-right">
          <div className="hero-stat">
            <span>Workflow</span>
            <strong>3 clear steps</strong>
          </div>

          <div className="hero-stat">
            <span>Review</span>
            <strong>Flag uncertain cases</strong>
          </div>

          <div className="hero-stat">
            <span>Output</span>
            <strong>Score + explanation</strong>
          </div>
        </div>
      </section>

      <section className="workflow-section">
        <div className="section-intro">
          <p className="eyebrow">Workflow</p>
          <h2>Three focused steps</h2>
        </div>

        <div className="workflow-grid">
          <Link to="/intake" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">01</span>
              <span className="step-line" />
            </div>
            <h3>Question Intake</h3>
            <p>Upload or paste exam questions and preview the structure clearly.</p>
          </Link>

          <Link to="/rubric" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">02</span>
              <span className="step-line" />
            </div>
            <h3>Rubric Review</h3>
            <p>Generate scoring criteria, revise wording, and approve the final rubric.</p>
          </Link>

          <Link to="/grading" className="workflow-step-card">
            <div className="step-top">
              <span className="step-index">03</span>
              <span className="step-line" />
            </div>
            <h3>Submission Grading</h3>
            <p>Grade in batch, inspect flagged cases, and keep instructors in the loop.</p>
          </Link>
        </div>
      </section>
    </main>
  )
}