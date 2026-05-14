import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { demoSlices, type DemoSlice } from '../demo'

export default function HomePage() {
  const navigate = useNavigate()
  const [demoMenuOpen, setDemoMenuOpen] = useState(false)
  const demoMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!demoMenuOpen) return
    function onClick(e: MouseEvent) {
      if (demoMenuRef.current && !demoMenuRef.current.contains(e.target as Node)) {
        setDemoMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [demoMenuOpen])

  function handleLoadDemo(slice: DemoSlice) {
    localStorage.setItem('grading_questions', JSON.stringify(slice.questions))
    localStorage.setItem('grading_rubrics', JSON.stringify(slice.rubrics))
    const approved = Object.fromEntries(
      Object.keys(slice.rubrics).map((id) => [id, 'approved'] as const),
    )
    localStorage.setItem('grading_row_statuses', JSON.stringify(approved))
    localStorage.setItem('grading_demo_submissions', slice.submissions)
    localStorage.setItem('grading_demo_prefill', '1')
    localStorage.setItem('grading_demo_professor_grades', slice.professorGrades)
    localStorage.setItem('grading_demo_eval_prefill', '1')
    localStorage.removeItem('grading_results')
    localStorage.removeItem('grading_submissions')
    navigate('/grading')
  }

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
            <Link to="/intake" className="primary-btn">
              Upload Questions
            </Link>
          </div>

          <div className="demo-data-actions" style={{ marginTop: 16 }}>
            <p className="tiny-label" style={{ marginBottom: 8 }}>Or try with a demo dataset</p>
            <div ref={demoMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                className="ghost-btn hero-secondary-btn"
                aria-haspopup="menu"
                aria-expanded={demoMenuOpen}
                onClick={() => setDemoMenuOpen((v) => !v)}
              >
                Demo Data ▾
              </button>
              {demoMenuOpen && (
                <div
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    minWidth: 360,
                    background: 'white',
                    border: '1px solid #d6dbe6',
                    borderRadius: 8,
                    boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
                    zIndex: 20,
                    padding: 4,
                  }}
                >
                  {demoSlices.map((slice) => (
                    <button
                      key={slice.id}
                      type="button"
                      role="menuitem"
                      className="ghost-btn"
                      onClick={() => { setDemoMenuOpen(false); handleLoadDemo(slice) }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{slice.label}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
