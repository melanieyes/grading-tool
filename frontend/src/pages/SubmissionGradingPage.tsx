import { useState } from 'react'
import { gradeBatch } from '../lib/api'

export default function SubmissionGradingPage() {
  const [jsonInput, setJsonInput] = useState(`[
  {
    "student_id":"001",
    "answer":"Deadlock happens because processes wait for resources in circular wait. Use resource ordering to prevent it."
  },
  {
    "student_id":"002",
    "answer":"Deadlock means programs wait forever."
  },
  {
    "student_id":"003",
    "answer":"Deadlock occurs when resources are locked. Prevention can use ordering."
  }
]`)

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function handleRun() {
    try {
      setLoading(true)

      const parsed = JSON.parse(jsonInput)

      const result = await gradeBatch(parsed)

      setData(result)
    } catch (error: any) {
      console.error(error)
      alert(error?.message || 'Invalid JSON or backend error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="shell page">
      <section className="page-head premium-head">
        <div>
          <p className="eyebrow">Live Grading</p>
          <h1>Grade a whole class in one run</h1>
          <p className="subtle">
            Batch grading with review-first workflow and confidence flags.
          </p>
        </div>

        <button
          className="primary-btn"
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? 'Grading...' : 'Run Batch Grading'}
        </button>
      </section>

      <section className="grading-layout">
        <div className="panel premium-panel">
          <div className="panel-head">
            <h3>Submission Input</h3>
            <span className="tiny-label">JSON Upload</span>
          </div>

          <textarea
            rows={18}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
        </div>

        <div className="grading-side">
          <div className="metric-card big-metric">
            <span>Students Loaded</span>
            <strong>{data ? data.count : 3}</strong>
          </div>

          <div className="metric-card big-metric">
            <span>Average Score</span>
            <strong>{data ? data.average_score : '--'}</strong>
          </div>

          <div className="metric-card big-metric">
            <span>Needs Review</span>
            <strong>{data ? data.review_count : '--'}</strong>
          </div>

          <div className="metric-card">
            <span>Status</span>
            <strong>
              {loading
                ? 'Running'
                : data
                ? 'Completed'
                : 'Idle'}
            </strong>
          </div>
        </div>
      </section>

      {data && (
        <>
          <section className="panel priority-panel">
            <div className="panel-head">
              <h3>Priority Review Queue</h3>
              <span className="tiny-label">
                Inspect uncertain cases first
              </span>
            </div>

            <table className="clean-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Question</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {data.review_queue.map((item: any) => (
                  <tr key={item.student_id}>
                    <td>{item.student_id}</td>
                    <td>{item.question_id}</td>
                    <td>{Math.round(item.confidence * 100)}%</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>All Results</h3>
              <span className="tiny-label">
                Final scoring output
              </span>
            </div>

            <table className="clean-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Reasoning</th>
                </tr>
              </thead>

              <tbody>
                {data.results.map((item: any) => (
                  <tr
                    key={item.student_id}
                    className={item.review_required ? 'warn-row' : ''}
                  >
                    <td>{item.student_id}</td>
                    <td>{item.score}/10</td>
                    <td>
                      {item.review_required
                        ? 'Needs Review'
                        : 'Approved'}
                    </td>
                    <td>{item.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  )
}