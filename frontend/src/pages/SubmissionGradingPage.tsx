import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { gradeBatch } from '../lib/api'

type Decision = 'pending' | 'approved' | 'rejected'

function loadSavedQuestions(): any[] {
  try {
    const raw = window.localStorage.getItem('grading_questions')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function loadSavedRubrics(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem('grading_rubrics')
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

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

function normalizeSubmissionRows(rows: any[]) {
  return rows
    .map((row) => ({
      student_id: row.student_id || row.id || '',
      question_id: row.question_id || row.qid || '',
      answer:
        row.answer ||
        row.answer_text ||
        row.student_answer ||
        row.response ||
        '',
    }))
    .filter((row) => row.student_id && row.answer)
}

function parseJsonSubmissions(text: string) {
  try {
    const parsed = JSON.parse(text)

    if (!Array.isArray(parsed)) return []

    // Format 1: flat JSON
    if (parsed[0]?.answer || parsed[0]?.student_answer || parsed[0]?.answer_text) {
      return normalizeSubmissionRows(parsed)
    }

    // Format 2: nested student -> answers[]
    if (parsed[0]?.answers && Array.isArray(parsed[0].answers)) {
      const flattened = parsed.flatMap((student: any) =>
        student.answers.map((answerRow: any) => ({
          student_id: student.student_id,
          question_id: answerRow.question_id,
          answer:
            answerRow.answer ||
            answerRow.answer_text ||
            answerRow.student_answer ||
            '',
        }))
      )

      return normalizeSubmissionRows(flattened)
    }

    return []
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
  const [jsonInput, setJsonInput] = useState(sampleJsonInput)
  const [fileName, setFileName] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [editedReasoning, setEditedReasoning] = useState<Record<string, string>>({})
  const [editedScores, setEditedScores] = useState<Record<string, number>>({})
  const [smoothProgress, setSmoothProgress] = useState(0)
  const gradingStartRef = useRef<number>(0)
  const gradingTotalRef = useRef<number>(0)

  useEffect(() => {
    if (!loading) return
    const tick = () => {
      const elapsed = Date.now() - gradingStartRef.current
      const total = Math.max(1, gradingTotalRef.current)
      const expectedMs = Math.max(8000, total * 9000)
      const timePct = Math.min(95, (elapsed / expectedMs) * 100)
      setSmoothProgress((prev) => Math.max(prev, timePct))
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [loading])

  useEffect(() => {
    try {
      const rawResults = window.localStorage.getItem('grading_results')
      if (rawResults) setData(JSON.parse(rawResults))
      const rawDecisions = window.localStorage.getItem('grading_decisions')
      if (rawDecisions) setDecisions(JSON.parse(rawDecisions))
      const rawReasoning = window.localStorage.getItem('grading_edited_reasoning')
      if (rawReasoning) setEditedReasoning(JSON.parse(rawReasoning))
      const rawScores = window.localStorage.getItem('grading_edited_scores')
      if (rawScores) setEditedScores(JSON.parse(rawScores))
    } catch {
      // ignore corrupted storage
    }
  }, [])

  useEffect(() => {
    if (data) window.localStorage.setItem('grading_results', JSON.stringify(data))
  }, [data])
  useEffect(() => {
    window.localStorage.setItem('grading_decisions', JSON.stringify(decisions))
  }, [decisions])
  useEffect(() => {
    window.localStorage.setItem('grading_edited_reasoning', JSON.stringify(editedReasoning))
  }, [editedReasoning])
  useEffect(() => {
    window.localStorage.setItem('grading_edited_scores', JSON.stringify(editedScores))
  }, [editedScores])

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const submissions = useMemo(() => parseJsonSubmissions(jsonInput), [jsonInput])

  const results = data?.results || []

  const stats = useMemo(() => {
    if (!results.length) return { min: 0, max: 0, mean: 0, review: 0 }

    const gradable = results.filter((r: any) => r.review_reason !== 'no_rubric')
    const scores = gradable.map((r: any) => Number(r.score || 0))

    return {
      min: scores.length ? Math.min(...scores) : 0,
      max: scores.length ? Math.max(...scores) : 0,
      mean: scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0,
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
      if (r.review_reason === 'no_rubric') return
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
      setJsonInput(text)
    }

    reader.readAsText(file)
  }

  async function handleRun() {
    try {
      if (!submissions.length) {
        alert('No valid submissions detected. Please upload a JSON file with student_id and answer.')
        return
      }
      setLoading(true)
      setSmoothProgress(0)
      gradingStartRef.current = Date.now()
      gradingTotalRef.current = submissions.length

      const normalizedSubmissions = submissions.map((row: any) => ({
        ...row,
        question_id: row.question_id || 'Q1',
      }))

      const questionEntries = loadSavedQuestions()
        .map((q: any): [string, any] | null => {
          const id = String(q?.question_id || '').trim()
          return id ? [id, q] : null
        })
        .filter((x): x is [string, any] => Boolean(x))

      const questionById = new Map<string, any>(questionEntries)
      const rubricsById = loadSavedRubrics()

      const enriched = normalizedSubmissions.map((row: any) => {
        const q: any = questionById.get(String(row.question_id || ''))
        const questionText = String(q?.question_text || q?.question || q?.text || '').trim() || `Question ${row.question_id}`
        const maxScore = Number(q?.max_score ?? 10)
        const benchmarkType = q?.benchmark_type ? String(q.benchmark_type) : undefined
        const rubricText = rubricsById[String(row.question_id || '')] || ''

        return {
          ...row,
          question_text: questionText,
          rubric: rubricText || undefined,
          max_score: Number.isFinite(maxScore) ? maxScore : 10,
          benchmark_type: benchmarkType,
        }
      })

      const result = await gradeBatch(enriched)

      setData(result)
      setDecisions({})
      setSmoothProgress(100)
    } catch (error: any) {
      alert(error?.message || 'Invalid file format or backend error.')
    } finally {
      setLoading(false)
    }
  }

  function getRowKey(item: any, index: number) {
    return `${item.student_id}-${item.question_id || index}`
  }

  function setDecision(rowKey: string, decision: Decision, currentReasoning?: string, currentScore?: number) {
    setDecisions((prev) => ({ ...prev, [rowKey]: decision }))

    if (decision === 'rejected') {
      setExpandedId(rowKey)
      setEditedReasoning((prev) => ({
        ...prev,
        [rowKey]: prev[rowKey] || currentReasoning || '',
      }))
      setEditedScores((prev) => ({
        ...prev,
        [rowKey]: prev[rowKey] ?? currentScore ?? 0,
      }))
    }
  }

  function exportJson() {
    const payload = results.map((r: any, index: number) => {
      const rowKey = getRowKey(r, index)
      return {
        student_id: r.student_id,
        question_id: r.question_id,
        score: editedScores[rowKey] ?? r.score,
        max_score: r.max_score ?? 10,
        status: r.review_required ? 'Needs Review' : 'Ready',
        decision: decisions[rowKey] || 'pending',
        reasoning: editedReasoning[rowKey] ?? r.reasoning ?? '',
      }
    })

    downloadFile(
      'grading_report.json',
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

    doc.setFontSize(18)
    doc.text('Grading Report', 40, 40)

    doc.setFontSize(11)
    doc.setTextColor(80)
    doc.text(
      `Mean: ${stats.mean.toFixed(1)}   Min: ${stats.min}   Max: ${stats.max}   Needs Review: ${stats.review}`,
      40,
      62,
    )

    const body = results.map((r: any, index: number) => {
      const rowKey = getRowKey(r, index)
      const noRubric = r.review_reason === 'no_rubric'
      const score = editedScores[rowKey] ?? r.score
      const maxScore = r.max_score ?? 10
      const scoreCell = noRubric ? '-/-' : `${score}/${maxScore}`
      const reasoning = editedReasoning[rowKey] ?? r.reasoning ?? ''
      return [
        String(index + 1),
        String(r.student_id ?? ''),
        String(r.question_id ?? '—'),
        scoreCell,
        r.review_required ? 'Needs Review' : 'Ready',
        decisions[rowKey] || 'pending',
        reasoning,
      ]
    })

    autoTable(doc, {
      startY: 84,
      head: [['#', 'Student', 'Question', 'Score', 'Status', 'Decision', 'Reasoning']],
      body,
      styles: { fontSize: 9, cellPadding: 6, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [243, 246, 255], textColor: [16, 34, 70], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 32, halign: 'center' },
        1: { cellWidth: 100 },
        2: { cellWidth: 80 },
        3: { cellWidth: 60, halign: 'center' },
        4: { cellWidth: 80, halign: 'center' },
        5: { cellWidth: 70, halign: 'center' },
        6: { cellWidth: 'auto' },
      },
      margin: { left: 40, right: 40 },
    })

    doc.save('grading_report.pdf')
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
          {loading ? 'Grading…' : 'Start grading'}
        </button>
      </section>

      {loading && (
        <section
          className="panel"
          style={{
            padding: '14px 16px',
            background: 'var(--info-bg, #eef4ff)',
            border: '1px solid var(--brand-200, #c7d7ff)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <strong style={{ fontSize: '0.95rem' }}>Grading submissions…</strong>
            <span className="tiny-label">{Math.round(smoothProgress)}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'rgba(0,0,0,0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${smoothProgress}%`,
                background: 'var(--brand-500, #3a6dff)',
                transition: 'width 280ms ease',
              }}
            />
          </div>
        </section>
      )}

      <section className="panel input-panel">
        <div className="panel-head">
          <div>
            <h3>Submission Input</h3>
            <span className="tiny-label">student_id + answer required</span>
          </div>

          <div className="upload-actions">
            <button type="button" className="primary-btn" onClick={handleUploadClick}>
              Upload JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileUpload}
            />

            {fileName && <span className="file-name-pill">{fileName}</span>}
          </div>
        </div>

        <div className="template-card">
          <strong>Required fields</strong>
          <span>student_id, question_id, answer / answer_text / student_answer</span>
        </div>

        <textarea
          className="editor-textarea code-textarea input-textarea"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />
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
                <button type="button" className="ghost-btn" onClick={exportJson}>
                  Export JSON
                </button>
                <button type="button" className="ghost-btn" onClick={exportPdf}>
                  Export PDF
                </button>
                <Link to="/evaluation" className="primary-btn">
                  Continue to Evaluation
                </Link>
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
                    <th>Question ID</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Reasoning</th>
                    <th className="action-col">Status / Action</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((item: any, index: number) => {
                    const rowKey = getRowKey(item, index)
                    const decision = decisions[rowKey] || 'pending'
                    const isExpanded = expandedId === rowKey

                    return (
                      <tr key={rowKey} className={item.review_required ? 'warn-row' : ''}>
                        <td className="center-col">{index + 1}</td>
                        <td className="mono-cell">{item.student_id}</td>
                        <td className="mono-cell">{item.question_id || '—'}</td>
                        <td>
                          {(() => {
                            const maxScore = Number(item.max_score ?? 10)
                            const noRubric = item.review_reason === 'no_rubric'
                            if (noRubric && decision !== 'rejected') {
                              return <strong>-/-</strong>
                            }
                            return decision === 'rejected' ? (
                              <div className="score-editor">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxScore}
                                  step={0.5}
                                  value={editedScores[rowKey] ?? item.score}
                                  onChange={(e) =>
                                    setEditedScores((prev) => ({
                                      ...prev,
                                      [rowKey]: Number(e.target.value),
                                    }))
                                  }
                                />
                                <span>/{maxScore}</span>
                              </div>
                            ) : (
                              <strong>{editedScores[rowKey] ?? item.score}/{maxScore}</strong>
                            )
                          })()}
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
                            onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                          >
                            {isExpanded ? 'Hide reasoning' : 'View reasoning'}
                            {editedReasoning[rowKey] !== undefined && (
                              <span
                                className="status-pill status-pill--info"
                                style={{ marginLeft: '6px', padding: '0 8px', fontSize: '0.7rem' }}
                              >
                                edited
                              </span>
                            )}
                          </button>

                          {isExpanded && decision === 'rejected' && (
                            <textarea
                              className="inline-reasoning-editor"
                              value={editedReasoning[rowKey] ?? item.reasoning ?? ''}
                              onChange={(e) =>
                                setEditedReasoning((prev) => ({
                                  ...prev,
                                  [rowKey]: e.target.value,
                                }))
                              }
                              placeholder="Edit the reasoning or write instructor feedback..."
                            />
                          )}

                          {isExpanded && decision !== 'rejected' && (
                            <p className="reasoning-detail">
                              {editedReasoning[rowKey] ?? item.reasoning}
                            </p>
                          )}
                        </td>
                        <td className="action-col">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
                            <span
                              className={`status-pill decision-${decision}`}
                              style={{ justifyContent: 'center' }}
                            >
                              {decision}
                            </span>
                            <button
                              type="button"
                              className="row-action-btn"
                              style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => setDecision(rowKey, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="row-action-btn danger"
                              style={{ width: '100%', justifyContent: 'center' }}
                              onClick={() => setDecision(rowKey, 'rejected', item.reasoning, item.score)}
                            >
                              Reject
                            </button>
                          </div>
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