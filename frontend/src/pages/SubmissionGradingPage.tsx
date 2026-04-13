import { useMemo, useState } from 'react'
import { sampleQuestionText, sampleSubmissionJson } from '../lib/demoData'
import {
  computeEvaluationMetrics,
  gradeSubmissions,
  parseQuestionsFromText,
  parseSubmissionsFromJson,
} from '../lib/gradingUtils'

export default function SubmissionGradingPage() {
  const [questionText, setQuestionText] = useState(sampleQuestionText)
  const [submissionJsonText, setSubmissionJsonText] = useState(sampleSubmissionJson)
  const [submissionFileName, setSubmissionFileName] = useState('')
  const [hasRun, setHasRun] = useState(false)

  const questions = useMemo(() => parseQuestionsFromText(questionText), [questionText])

  const submissions = useMemo(() => {
    try {
      const parsed = JSON.parse(submissionJsonText)
      return parseSubmissionsFromJson(parsed)
    } catch {
      return []
    }
  }, [submissionJsonText])

  const gradedResults = useMemo(() => {
    if (!hasRun) return []
    return gradeSubmissions(submissions, questions)
  }, [hasRun, submissions, questions])

  const metrics = useMemo(() => {
    if (!hasRun) {
      return {
        mae: 0,
        exactMatchRate: 0,
        pearsonProxy: 0,
        reviewRate: 0,
      }
    }
    return computeEvaluationMetrics(gradedResults)
  }, [hasRun, gradedResults])

  function handleSubmissionFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setSubmissionFileName(file.name)

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setSubmissionJsonText(text)
    }
    reader.readAsText(file)
  }

  return (
    <main className="page-content">
      <section className="page-header-card">
        <p className="eyebrow">Submission Grading</p>
        <h1 className="page-title">Upload answers and run grading</h1>
        <p className="page-copy">
          Each result includes score, grading reasoning, confidence level, and a review flag for uncertain cases.
        </p>
      </section>

      <section className="section-panel">
        <div className="kpi-grid compact">
          <div className="kpi-card">
            <h2>Questions</h2>
            <p className="kpi-value">{questions.length}</p>
          </div>
          <div className="kpi-card">
            <h2>Submissions</h2>
            <p className="kpi-value">{submissions.length}</p>
          </div>
        </div>

        <div className="builder-grid">
          <div className="editor-block">
            <label htmlFor="grading-question-source">Question Source</label>
            <textarea
              id="grading-question-source"
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
            />

            <label htmlFor="submission-file">Upload Submission JSON</label>
            <input
              id="submission-file"
              className="file-input"
              type="file"
              accept=".json,application/json,text/plain"
              onChange={handleSubmissionFileUpload}
            />
            <p className="file-hint">
              {submissionFileName
                ? `Loaded: ${submissionFileName}`
                : 'No submission file uploaded yet.'}
            </p>

            <label htmlFor="submission-json">Submission JSON</label>
            <textarea
              id="submission-json"
              value={submissionJsonText}
              onChange={(event) => setSubmissionJsonText(event.target.value)}
            />

            <button type="button" className="primary-btn" onClick={() => setHasRun(true)}>
              Run Grading
            </button>
          </div>

          <div className="editor-block">
            <label htmlFor="grading-preview">Raw Preview</label>
            <textarea
              id="grading-preview"
              readOnly
              value={
                hasRun
                  ? gradedResults
                      .map((result) => {
                        const details = result.questions
                          .map(
                            (question) =>
                              `${question.questionId}: ${question.score}/${question.maxScore} | ${question.confidenceLabel} confidence | ${question.reviewRequired ? 'Needs Review' : 'OK'}`,
                          )
                          .join('\n')

                        return `${result.studentId}\nTotal: ${result.totalScore}/${result.maxScore}\n${details}`
                      })
                      .join('\n\n')
                  : 'Run grading to preview results.'
              }
            />
          </div>
        </div>
      </section>

      {hasRun && (
        <>
          <section className="section-panel">
            <div className="section-head-lite">
              <div>
                <h2>Evaluation Snapshot</h2>
                <p>Compact run diagnostics for the current grading output.</p>
              </div>
            </div>

            <div className="kpi-grid">
              <div className="kpi-card">
                <h2>MAE</h2>
                <p className="kpi-value">{metrics.mae}</p>
              </div>
              <div className="kpi-card">
                <h2>Exact Match</h2>
                <p className="kpi-value">{metrics.exactMatchRate}%</p>
              </div>
              <div className="kpi-card">
                <h2>Pearson Proxy</h2>
                <p className="kpi-value">{metrics.pearsonProxy}</p>
              </div>
              <div className="kpi-card">
                <h2>Needs Review</h2>
                <p className="kpi-value">{metrics.reviewRate}%</p>
              </div>
            </div>
          </section>

          <section className="results-stack">
            {gradedResults.map((student) => (
              <article key={student.studentId} className="result-card">
                <div className="result-card-head">
                  <div>
                    <p className="result-label">Student</p>
                    <h2>{student.studentId}</h2>
                  </div>
                  <div className="result-total">
                    <span>Total</span>
                    <strong>
                      {student.totalScore}/{student.maxScore}
                    </strong>
                  </div>
                </div>

                <div className="question-result-stack">
                  {student.questions.map((question) => (
                    <div key={question.questionId} className="question-result-card">
                      <div className="question-result-top">
                        <h3>{question.questionId}</h3>
                        <div className="badge-row">
                          <span className="score-chip">
                            {question.score}/{question.maxScore}
                          </span>
                          <span
                            className={`confidence-chip confidence-${question.confidenceLabel.toLowerCase()}`}
                          >
                            {question.confidenceLabel} confidence
                          </span>
                          {question.reviewRequired && (
                            <span className="review-chip">Needs Review</span>
                          )}
                        </div>
                      </div>

                      <p className="question-reasoning">{question.reasoning}</p>

                      <div className="confidence-meter-block">
                        <div className="confidence-meter-label">
                          <span>Confidence</span>
                          <span>{Math.round(question.confidence * 100)}%</span>
                        </div>
                        <div className="confidence-meter">
                          <div
                            className="confidence-meter-fill"
                            style={{ width: `${Math.round(question.confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  )
}