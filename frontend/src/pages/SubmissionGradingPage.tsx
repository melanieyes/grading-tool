import { useState } from 'react'
import { gradeBatch } from '../lib/api'

export default function SubmissionGradingPage() {
  const [jsonInput, setJsonInput] = useState(`[
  {
    "student_id": "001",
    "answer": "Deadlock happens because processes wait for resources in circular wait. Use resource ordering to prevent it."
  },
  {
    "student_id": "002",
    "answer": "Deadlock means programs wait forever."
  },
  {
    "student_id": "003",
    "answer": "Deadlock occurs when resources are locked and processes cannot continue. Prevention can use ordering."
  }
]`)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  async function handleRun() {
    try {
      setLoading(true)

      const submissions = JSON.parse(jsonInput)
      const result = await gradeBatch(submissions)

      setData(result)
    } catch {
      alert('Invalid JSON or backend error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-content">
      <section className="page-header-card">
        <p className="eyebrow">Submission Grading</p>
        <h1 className="page-title">Batch grade a whole class</h1>
        <p className="page-copy">
          Upload multiple submissions and auto-grade instantly.
        </p>
      </section>

      <section className="section-panel">
        <div className="editor-block">
          <label>Batch Submission JSON</label>

          <textarea
            rows={14}
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />

          <button
            className="primary-btn"
            onClick={handleRun}
            disabled={loading}
          >
            {loading ? 'Grading...' : 'Run Batch Grading'}
          </button>
        </div>
      </section>

      {data && (
        <>
          <section className="section-panel">
            <div className="kpi-grid">
              <div className="kpi-card">
                <h2>Students</h2>
                <p className="kpi-value">{data.count}</p>
              </div>

              <div className="kpi-card">
                <h2>Average Score</h2>
                <p className="kpi-value">{data.average_score}</p>
              </div>

              <div className="kpi-card">
                <h2>Needs Review</h2>
                <p className="kpi-value">{data.review_count}</p>
              </div>
            </div>
          </section>

          <section className="section-panel">
            <h2 className="section-title">Review Queue</h2>

            <table className="results-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Question</th>
                  <th>Score</th>
                  <th>Confidence</th>
                  <th>Reason</th>
                </tr>
              </thead>

              <tbody>
                {data.review_queue.map((item: any) => (
                  <tr key={item.student_id}>
                    <td>{item.student_id}</td>
                    <td>{item.question_id}</td>
                    <td>{item.score}/10</td>
                    <td>{Math.round(item.confidence * 100)}%</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="section-panel">
            <h2 className="section-title">All Results</h2>

            <table className="results-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Score</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Reasoning</th>
                </tr>
              </thead>

              <tbody>
                {data.results.map((item: any) => (
                  <tr
                    key={item.student_id}
                    className={
                      item.review_required ? 'flag-row' : ''
                    }
                  >
                    <td>{item.student_id}</td>
                    <td>{item.score}/10</td>
                    <td>{Math.round(item.confidence * 100)}%</td>
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