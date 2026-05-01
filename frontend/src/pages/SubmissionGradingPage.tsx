import { useMemo, useRef, useState } from 'react'
import { gradeBatch } from '../lib/api'

type SubmissionMode = 'json' | 'csv'
type Decision = 'pending' | 'approved' | 'rejected'

const sampleJsonInput = `[
  {
    "student_id": "S10485739",
    "answer": "Deadlock happens when processes wait in a circular chain. Resource ordering can prevent circular wait."
  },
  {
    "student_id": "S10492811",
    "answer": "Deadlock means programs wait forever."
  }
]`

const sampleCsvInput = `student_id,answer
S10485739,"Deadlock happens when processes wait in a circular chain. Resource ordering can prevent circular wait."
S10492811,"Deadlock means programs wait forever."`

function splitCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      insideQuotes = !insideQuotes
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}

function parseCsvSubmissions(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())

  return lines.slice(1)
    .map((line) => {
      const values = splitCsvLine(line)
      const row: Record<string, string> = {}

      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      return {
        student_id: row.student_id || row.id || '',
        answer: row.answer || row.student_answer || row.response || '',
      }
    })
    .filter((s) => s.student_id && s.answer)
}

function parseJsonSubmissions(text: string) {
  try {
    const parsed = JSON.parse(text)

    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item: any) => ({
        student_id: item.student_id || item.id || '',
        answer: item.answer || item.student_answer || item.response || '',
      }))
      .filter((s) => s.student_id && s.answer)
  } catch {
    return []
  }
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

export default function SubmissionGradingPage() {
  const [mode, setMode] = useState<SubmissionMode>('json')
  const [jsonInput, setJsonInput] = useState(sampleJsonInput)
  const [csvInput, setCsvInput] = useState(sampleCsvInput)
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [editedReasoning, setEditedReasoning] = useState<Record<string, string>>({})
  const [editedScores, setEditedScores] = useState<Record<string, number>>({})

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const submissions = useMemo(() => {
    return mode === 'json'
      ? parseJsonSubmissions(jsonInput)
      : parseCsvSubmissions(csvInput)
  }, [mode, jsonInput, csvInput])

  const results = data?.results || []

  const stats = useMemo(() => {
    if (!results.length) return { min: 0, max: 0, mean: 0, review: 0 }

    const scores = results.map((r: any) => Number(r.score || 0))

    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
      mean: scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
      review: results.filter((r: any) => r.review_required).length,
    }
  }, [results])

  const distribution = useMemo(() => {
    const buckets = [
      { label: '0–2', min: 0, max: 2, count: 0 },
      { label: '3–4', min: 3, max: 4, count: 0 },
      { label: '5–6', min: 5, max: 6, count: 0 },
      { label: '7–8', min: 7, max: 8, count: 0 },
      { label: '9–10', min: 9, max: 10, count: 0 },
    ]

    results.forEach((r: any) => {
      const score = Number(r.score || 0)
      const bucket = buckets.find((b) => score >= b.min && score <= b.max)
      if (bucket) bucket.count += 1
    })

    return buckets
  }, [results])

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    const reader = new FileReader()

    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''

      if (file.name.endsWith('.csv')) {
        setMode('csv')
        setCsvInput(text)
      } else {
        setMode('json')
        setJsonInput(text)
      }
    }

    reader.readAsText(file)
  }

  async function handleRun() {
    try {
      setLoading(true)

      if (!submissions.length) {
        alert('No valid submissions detected. Please upload a CSV or JSON file with student_id and answer.')
        return
      }

      const result = await gradeBatch(submissions)

      setData(result)
      setDecisions({})
    } catch (error: any) {
      alert(error?.message || 'Invalid file format or backend error.')
    } finally {
      setLoading(false)
    }
  }

  function setDecision(studentId: string, decision: Decision, currentReasoning?: string, currentScore?: number) {
    setDecisions((prev) => ({ ...prev, [studentId]: decision }))

    if (decision === 'rejected') {
      setExpandedId(studentId)
      setEditedReasoning((prev) => ({
        ...prev,
        [studentId]: prev[studentId] || currentReasoning || '',
      }))
      setEditedScores((prev) => ({
        ...prev,
        [studentId]: prev[studentId] ?? currentScore ?? 0,
      }))
    }
  }

  function exportCsv() {
    const rows = [
      ['student_id', 'score', 'status', 'decision', 'reasoning'],
      ...results.map((r: any) => [
        r.student_id,
        r.score,
        r.review_required ? 'Needs Review' : 'Ready',
        decisions[r.student_id] || 'pending',
        `"${String(r.reasoning || '').replaceAll('"', '""')}"`,
      ]),
    ]

    downloadFile('grading_report.csv', rows.map((r) => r.join(',')).join('\n'), 'text/csv')
  }

  function exportPdf() {
    const html = `
      <html>
        <head>
          <title>Grading Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #102246; }
            h1 { margin-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            th, td { border: 1px solid #d7def0; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #f3f6ff; }
          </style>
        </head>
        <body>
          <h1>Grading Report</h1>
          <p>Mean: ${stats.mean.toFixed(1)} | Min: ${stats.min} | Max: ${stats.max}</p>

          <table>
            <tr>
              <th>Student</th>
              <th>Score</th>
              <th>Status</th>
              <th>Decision</th>
              <th>Reasoning</th>
            </tr>
            ${results.map((r: any) => `
              <tr>
                <td>${r.student_id}</td>
                <td>${r.score}/10</td>
                <td>${r.review_required ? 'Needs Review' : 'Ready'}</td>
                <td>${decisions[r.student_id] || 'pending'}</td>
                <td>${r.reasoning || ''}</td>
              </tr>
            `).join('')}
          </table>
        </body>
      </html>
    `

    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(html)
    win.document.close()
    win.print()
  }

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Submission Grading</p>
          <h1>Review grading results</h1>
          <p className="subtle">
            Upload submissions, run batch grading, inspect reasoning, and approve or reject outputs.
          </p>
        </div>

        <button className="primary-btn" onClick={handleRun} disabled={loading}>
          {loading ? 'Grading...' : 'Run Batch Grading'}
        </button>
      </section>

      <section className="panel input-panel">
        <div className="panel-head">
          <div>
            <h3>Submission Input</h3>
            <span className="tiny-label">student_id + answer required</span>
          </div>

          <div className="upload-actions">
            <button type="button" className="primary-btn" onClick={handleUploadClick}>
              Upload {mode.toUpperCase()}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              onChange={handleFileUpload}
            />

            {fileName && <span className="file-name-pill">{fileName}</span>}
          </div>
        </div>

        <div className="mode-switch grading-mode-switch">
          <button
            type="button"
            className={`mode-btn ${mode === 'json' ? 'active' : ''}`}
            onClick={() => setMode('json')}
          >
            JSON Input
          </button>

          <button
            type="button"
            className={`mode-btn ${mode === 'csv' ? 'active' : ''}`}
            onClick={() => setMode('csv')}
          >
            CSV Input
          </button>
        </div>

        <div className="template-card">
          <strong>Required fields</strong>
          <span>student_id, answer</span>
        </div>

        <textarea
          className="editor-textarea code-textarea input-textarea"
          value={mode === 'json' ? jsonInput : csvInput}
          onChange={(e) =>
            mode === 'json'
              ? setJsonInput(e.target.value)
              : setCsvInput(e.target.value)
          }
        />

        <div className="input-preview-row">
          <span className={submissions.length > 0 ? 'status-pill status-pill--success' : 'status-pill status-pill--warning'}>
            {submissions.length > 0
              ? `${submissions.length} submissions detected`
              : 'No valid submissions detected'}
          </span>
        </div>
      </section>

      {results.length > 0 && (
        <>
          <section className="panel result-overview">
            <div className="metric-card">
              <span>Mean</span>
              <strong>{stats.mean.toFixed(1)}</strong>
            </div>
            <div className="metric-card">
              <span>Min</span>
              <strong>{stats.min}</strong>
            </div>
            <div className="metric-card">
              <span>Max</span>
              <strong>{stats.max}</strong>
            </div>
            <div className="metric-card">
              <span>Needs Review</span>
              <strong>{stats.review}</strong>
            </div>
          </section>

          <section className="panel chart-panel">
            <div className="panel-head">
              <h3>Grade Distribution</h3>

              <div className="export-actions">
                <button type="button" className="ghost-btn" onClick={exportCsv}>
                  Export CSV
                </button>
                <button type="button" className="ghost-btn" onClick={exportPdf}>
                  Export PDF
                </button>
              </div>
            </div>

            <div className="grade-bars">
              {distribution.map((bucket) => {
                const height = Math.max(8, bucket.count * 24)

                return (
                  <div className="grade-bar-item" key={bucket.label}>
                    <div className="grade-bar-track">
                      <div className="grade-bar-fill" style={{ height }} />
                    </div>
                    <strong>{bucket.count}</strong>
                    <span>{bucket.label}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>All Results</h3>
              <span className="tiny-label">Interactive review table</span>
            </div>

            <div className="table-wrap">
              <table className="clean-table clean-table--compact results-table">
                <thead>
                  <tr>
                    <th className="center-col">Index</th>
                    <th>Student ID</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Reasoning</th>
                    <th>Decision</th>
                    <th className="action-col">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((item: any, index: number) => {
                    const decision = decisions[item.student_id] || 'pending'
                    const isExpanded = expandedId === item.student_id

                    return (
                      <tr key={item.student_id} className={item.review_required ? 'warn-row' : ''}>
                        <td className="center-col">{index + 1}</td>
                        <td className="mono-cell">{item.student_id}</td>
                        <td>
                          {decision === 'rejected' ? (
                            <div className="score-editor">
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.5}
                                value={editedScores[item.student_id] ?? item.score}
                                onChange={(e) =>
                                  setEditedScores((prev) => ({
                                    ...prev,
                                    [item.student_id]: Number(e.target.value),
                                  }))
                                }
                              />
                              <span>/10</span>
                            </div>
                          ) : (
                            <strong>{editedScores[item.student_id] ?? item.score}/10</strong>
                          )}
                        </td>
                        <td>
                          <span className={item.review_required ? 'status-pill status-pill--warning' : 'status-pill status-pill--success'}>
                            {item.review_required ? 'Needs Review' : 'Ready'}
                          </span>
                        </td>
                        <td className="reasoning-cell">
                          <button
                            type="button"
                            className="reasoning-toggle"
                            onClick={() => setExpandedId(isExpanded ? null : item.student_id)}
                          >
                            {isExpanded ? 'Hide reasoning' : 'View reasoning'}
                          </button>

                          {isExpanded && decision === 'rejected' && (
                            <textarea
                              className="inline-reasoning-editor"
                              value={editedReasoning[item.student_id] || item.reasoning || ''}
                              onChange={(e) =>
                                setEditedReasoning((prev) => ({
                                  ...prev,
                                  [item.student_id]: e.target.value,
                                }))
                              }
                              placeholder="Edit the reasoning or write instructor feedback..."
                            />
                          )}

                          {isExpanded && decision !== 'rejected' && (
                            <p className="reasoning-detail">{item.reasoning}</p>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill decision-${decision}`}>
                            {decision}
                          </span>
                        </td>
                        <td className="action-col action-stack">
                          <button
                            type="button"
                            className="row-action-btn"
                            onClick={() => setDecision(item.student_id, 'approved')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="row-action-btn danger"
                            onClick={() => setDecision(item.student_id, 'rejected', item.reasoning, item.score)}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}