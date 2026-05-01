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

function improveRubric(questionText: string, feedback: string, selectedReason: string) {
  const questions = questionText
    .split(/\n\s*\n/)
    .map((q) => q.trim())
    .filter(Boolean)

  const revisionFocus =
    selectedReason || feedback.trim() || 'Improve reasoning depth and partial-credit clarity'

  return [
    'Revised Rubric',
    'Scale: 0–10 per question',
    '',
    `Revision focus: ${revisionFocus}`,
    '',
    ...questions.map((question, index) => {
      const cleanQuestion = question.replace(/^Q\d+\.\s*/i, '').trim()

      return [
        `Q${index + 1}. ${cleanQuestion}`,
        '- Conceptual accuracy and use of correct definitions (0–3)',
        '- Step-by-step reasoning and logical justification (0–3)',
        '- Application to the specific question, not generic explanation (0–2)',
        '- Completeness, precision, and clarity of final answer (0–2)',
        '- Full credit: answer directly addresses the prompt, uses correct theory, and explains why the conclusion follows.',
        '- Partial credit: answer identifies relevant concepts but has incomplete reasoning, missing proof steps, or weak explanation.',
        '- Low credit: answer is mostly generic, unsupported, or only states a conclusion.',
        '- Manual review trigger: contradiction, hallucinated theorem, vague reasoning, or unusually short response.',
      ].join('\n')
    }),
  ].join('\n\n')
}

function loadSavedQuestionsForRubric() {
  try {
    const saved = localStorage.getItem('grading_questions')
    if (!saved) return null

    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    return parsed
  } catch {
    return null
  }
}

function cleanQuestionText(text: string) {
  return text.replace(/^Q\d+\.\s*/i, '').trim()
}

function formatSavedQuestionsForRubric(questions: any[]) {
  return questions
    .map((q, index) => {
      const id = q.question_id || q.id || `q${index + 1}`
      const text = cleanQuestionText(q.question || q.question_text || '')
      const score = q.max_score || q.points || 10

      return `Q${index + 1}. [${id}, ${score} pts] ${text}`
    })
    .join('\n\n')
}

export default function RubricReviewPage() {
  const [questionText, setQuestionText] = useState(() => {
    const savedQuestions = loadSavedQuestionsForRubric()
    return savedQuestions
      ? formatSavedQuestionsForRubric(savedQuestions)
      : sampleQuestionText
  })
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

    const revised = improveRubric(questionText, reviewerComment, selectedReason)

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

  const statusClass = {
    draft: 'status-pill status-pill--neutral',
    revision_requested: 'status-pill status-pill--warning',
    revised_draft: 'status-pill status-pill--info',
    approved: 'status-pill status-pill--success',
  }[status]

  return (
    <main className="shell rubric-page">
      <section className="panel rubric-hero">
        <div className="rubric-hero-copy">
          <p className="eyebrow">Rubric Review</p>
          <h1 className="rubric-title rubric-title--compact">Refine Rubric</h1>
          <p className="rubric-copy">
            Review and approve your final grading criteria.
          </p>
        </div>

        <div className="rubric-hero-meta">
          <div className="hero-stat">
            <span>Questions</span>
            <strong>{questions.length} detected</strong>
          </div>
          <div className="hero-stat">
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </div>
        </div>
      </section>

      <section className="panel rubric-builder">
        <div className="rubric-grid">
          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Source</p>
                <h2>Question Source</h2>
              </div>
            </div>

            <div className="editor-stack">
              <label htmlFor="rubric-questions" className="field-label">
                Review question set
              </label>
              <textarea
                id="rubric-questions"
                className="editor-textarea editor-textarea--lg"
                value={questionText}
                onChange={(event) => setQuestionText(event.target.value)}
              />
            </div>

            <div className="editor-actions">
              <button type="button" className="primary-btn" onClick={handleGenerateRubric}>
                Generate Rubric
              </button>
            </div>
          </section>

          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Draft</p>
                <h2>Current Rubric Draft</h2>
              </div>

              <div className={statusClass}>{statusLabel}</div>
            </div>

            <div className="editor-stack">
              <label htmlFor="rubric-draft" className="field-label">
                Edit rubric text
              </label>
              <textarea
                id="rubric-draft"
                className="editor-textarea editor-textarea--lg"
                value={rubricText}
                onChange={(event) => setRubricText(event.target.value)}
              />
            </div>

            <div className="editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handleApproveRubric}
              >
                Approve Rubric
              </button>

              <button
                type="button"
                className="ghost-btn"
                onClick={handleRequestRevision}
              >
                Request Revision
              </button>
            </div>
          </section>
        </div>

        {showRevisionPanel && (
          <section className="editor-card revision-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Feedback</p>
                <h2>Revision Request</h2>
              </div>
            </div>

            <p className="section-note">
              Tell the system what should be improved before regenerating the rubric.
            </p>

            <div className="revision-grid">
              <div className="editor-stack">
                <label htmlFor="revision-reason" className="field-label">
                  Revision reason
                </label>
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

              <div className="editor-stack">
                <label htmlFor="reviewer-comment" className="field-label">
                  Reviewer comment
                </label>
                <textarea
                  id="reviewer-comment"
                  className="editor-textarea editor-textarea--md"
                  value={reviewerComment}
                  onChange={(event) => setReviewerComment(event.target.value)}
                  placeholder="Example: Add stronger reasoning criteria, differentiate full credit from partial credit, and include expected OS concepts such as context switching, responsiveness, and fairness."
                />
              </div>
            </div>

            <div className="editor-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={handleRegenerateRubric}
              >
                Regenerate from Feedback
              </button>

              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowRevisionPanel(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {previousRubric && (
          <section className="editor-card compare-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Comparison</p>
                <h2>Revision Comparison</h2>
              </div>
            </div>

            <p className="section-note">
              Compare the previous draft with the revised rubric.
            </p>

            <div className="rubric-grid">
              <div className="editor-stack">
                <label htmlFor="previous-rubric" className="field-label">
                  Previous draft
                </label>
                <textarea
                  id="previous-rubric"
                  className="editor-textarea editor-textarea--lg preview-textarea"
                  value={previousRubric}
                  readOnly
                />
              </div>

              <div className="editor-stack">
                <label htmlFor="revised-rubric" className="field-label">
                  Revised draft
                </label>
                <textarea
                  id="revised-rubric"
                  className="editor-textarea editor-textarea--lg preview-textarea"
                  value={rubricText}
                  readOnly
                />
              </div>
            </div>
          </section>
        )}

        {status === 'approved' && (
          <section className="approval-banner">
            <div>
              <p className="tiny-label">Ready</p>
              <h2>Rubric approved</h2>
              <p>The scoring guide is ready for submission grading.</p>
            </div>

            <Link to="/grading" className="primary-btn">
              Continue to Grading
            </Link>
          </section>
        )}
      </section>
    </main>
  )
}