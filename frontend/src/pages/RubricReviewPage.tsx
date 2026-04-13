import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { sampleQuestionText, sampleRubric } from '../lib/demoData'
import { buildRubric, parseQuestionsFromText } from '../lib/gradingUtils'

type RubricStatus =
  | 'draft'
  | 'revision_requested'
  | 'revised_draft'
  | 'approved'

const revisionOptions = [
  'Criteria are too generic',
  'Scoring weights are unclear',
  'Rubric does not match reasoning depth',
  'Need more partial-credit guidance',
  'Expected key points are missing',
]

function improveRubric(baseRubric: string, feedback: string, selectedReason: string) {
  const trimmedFeedback = feedback.trim()
  const extraNotes: string[] = []

  if (selectedReason) {
    extraNotes.push(`Reviewer concern: ${selectedReason}`)
  }

  if (trimmedFeedback) {
    extraNotes.push(`Reviewer note: ${trimmedFeedback}`)
  }

  return [
    baseRubric,
    '',
    'Revision Notes',
    ...extraNotes.map((note) => `- ${note}`),
    '- Add clearer partial-credit guidance.',
    '- Make expected reasoning steps more explicit.',
    '- Clarify what earns full credit versus partial credit.',
  ].join('\n')
}

export default function RubricReviewPage() {
  const [questionText, setQuestionText] = useState(sampleQuestionText)
  const [rubricText, setRubricText] = useState(sampleRubric)
  const [previousRubric, setPreviousRubric] = useState('')
  const [status, setStatus] = useState<RubricStatus>('draft')

  const [showRevisionPanel, setShowRevisionPanel] = useState(false)
  const [selectedReason, setSelectedReason] = useState(revisionOptions[0])
  const [reviewerComment, setReviewerComment] = useState('')

  const questions = useMemo(() => parseQuestionsFromText(questionText), [questionText])

  function handleGenerateRubric() {
    const nextRubric = buildRubric(questions)
    setPreviousRubric('')
    setRubricText(nextRubric)
    setStatus('draft')
    setShowRevisionPanel(false)
    setReviewerComment('')
  }

  function handleRequestRevision() {
    setStatus('revision_requested')
    setShowRevisionPanel(true)
  }

  function handleRegenerateRubric() {
    setPreviousRubric(rubricText)
    const revised = improveRubric(rubricText, reviewerComment, selectedReason)
    setRubricText(revised)
    setStatus('revised_draft')
    setShowRevisionPanel(false)
  }

  function handleApproveRubric() {
    setStatus('approved')
    setShowRevisionPanel(false)
  }

  const statusLabel = {
    draft: 'Draft Ready',
    revision_requested: 'Revision Requested',
    revised_draft: 'Revised Draft',
    approved: 'Approved',
  }[status]

  const statusTone = {
    draft: 'status-neutral',
    revision_requested: 'status-warning',
    revised_draft: 'status-info',
    approved: 'status-success',
  }[status]

  return (
    <main className="page-content">
      <section className="page-header-card">
        <p className="eyebrow">Rubric Review</p>
        <h1 className="page-title">Generate and refine the scoring guide</h1>
        <p className="page-copy">
          Review the rubric, request revisions with clear feedback, then approve the final version before grading.
        </p>
      </section>

      <section className="section-panel">
        <div className="kpi-grid compact">
          <div className="kpi-card">
            <h2>Questions</h2>
            <p className="kpi-value">{questions.length}</p>
          </div>

          <div className="kpi-card">
            <h2>Status</h2>
            <p className={`kpi-value status ${statusTone}`}>{statusLabel}</p>
          </div>
        </div>

        <div className="builder-grid">
          <div className="editor-block">
            <label htmlFor="rubric-questions">Question Source</label>
            <textarea
              id="rubric-questions"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
            />

            <button type="button" className="primary-btn" onClick={handleGenerateRubric}>
              Generate Rubric
            </button>
          </div>

          <div className="editor-block">
            <label htmlFor="rubric-draft">Current Rubric Draft</label>
            <textarea
              id="rubric-draft"
              value={rubricText}
              onChange={(event) => setRubricText(event.target.value)}
            />

            <div className="button-row">
              <button
                type="button"
                className="primary-btn"
                onClick={handleApproveRubric}
              >
                Approve Rubric
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={handleRequestRevision}
              >
                Request Revision
              </button>
            </div>
          </div>
        </div>

        {showRevisionPanel && (
          <div className="review-panel">
            <div className="review-panel-head">
              <div>
                <h2>Revision Request</h2>
                <p>Tell the system what should be improved before regenerating the rubric.</p>
              </div>
            </div>

            <div className="review-form-grid">
              <div className="editor-block">
                <label htmlFor="revision-reason">Reason</label>
                <select
                  id="revision-reason"
                  className="select-input"
                  value={selectedReason}
                  onChange={(event) => setSelectedReason(event.target.value)}
                >
                  {revisionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="editor-block">
                <label htmlFor="reviewer-comment">Reviewer Comment</label>
                <textarea
                  id="reviewer-comment"
                  value={reviewerComment}
                  onChange={(event) => setReviewerComment(event.target.value)}
                  placeholder="Example: Add stronger reasoning criteria, differentiate full credit from partial credit, and include expected OS concepts such as context switching, responsiveness, and fairness."
                />
              </div>
            </div>

            <div className="button-row">
              <button
                type="button"
                className="primary-btn"
                onClick={handleRegenerateRubric}
              >
                Regenerate from Feedback
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowRevisionPanel(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {previousRubric && (
          <div className="compare-panel">
            <div className="review-panel-head">
              <div>
                <h2>Revision Comparison</h2>
                <p>Compare the previous draft with the revised rubric.</p>
              </div>
            </div>

            <div className="builder-grid">
              <div className="editor-block">
                <label htmlFor="previous-rubric">Previous Draft</label>
                <textarea id="previous-rubric" value={previousRubric} readOnly />
              </div>

              <div className="editor-block">
                <label htmlFor="revised-rubric">Revised Draft</label>
                <textarea id="revised-rubric" value={rubricText} readOnly />
              </div>
            </div>
          </div>
        )}

        {status === 'approved' && (
          <div className="approval-banner">
            <div>
              <h2>Rubric approved</h2>
              <p>The scoring guide is ready for submission grading.</p>
            </div>

            <Link to="/grading" className="primary-link-btn">
              Continue to Grading
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}