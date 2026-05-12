import { useEffect, useMemo, useRef, useState } from 'react'
import {
  gradeBatch,
  loadApiSettings,
  runCalibration,
  runEvaluation,
  saveApiSettings,
} from '../lib/api'

function loadSavedQuestions(): any[] {
  try {
    const raw = window.localStorage.getItem('grading_questions')
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function EvaluationPage() {
  // Backend-connected evaluation + calibration page.
  // This aligns to: training data -> rubric -> grading results vs ground truth -> MSE -> calibrate to reduce MSE.

  const submissionsTemplate = `[
  {
    "student_id": "S001",
    "question_id": "q1",
    "answer": "Deadlock happens when processes wait in a circular chain. Resource ordering prevents circular wait."
  },
  {
    "student_id": "S002",
    "question_id": "q1",
    "answer": "Deadlock means programs wait forever."
  }
]`

  const professorGradesTemplate = `[
  {
    "student_id": "S001",
    "question_id": "q1",
    "score": 8,
    "max_score": 10,
    "comment": "Good but missing detail."
  },
  {
    "student_id": "S002",
    "question_id": "q1",
    "score": 4,
    "max_score": 10,
    "comment": "Too vague."
  }
]`

  const rubricTemplate = `- Conceptual accuracy and correct definitions (0-5)\n- Step-by-step reasoning and justification (0-5)`

  const [backendUrl, setBackendUrl] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [questionId, setQuestionId] = useState('q1')
  const [differenceThreshold, setDifferenceThreshold] = useState(0.5)
  const [maxRounds, setMaxRounds] = useState(5)
  const [minImprovement, setMinImprovement] = useState(0.01)
  const [targetMse, setTargetMse] = useState<string>('')

  const [submissionsJson, setSubmissionsJson] = useState(submissionsTemplate)
  const [professorGradesJson, setProfessorGradesJson] = useState(professorGradesTemplate)
  const [rubricText, setRubricText] = useState(rubricTemplate)

  const [aiResults, setAiResults] = useState<any[] | null>(null)
  const [evaluation, setEvaluation] = useState<any | null>(null)
  const [calibration, setCalibration] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(true)

  const submissionsFileInputRef = useRef<HTMLInputElement | null>(null)
  const gradesFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const settings = loadApiSettings()
    setBackendUrl(settings.backend_api_base_url)
  }, [])

  function safeParseArray(text: string) {
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const submissions = useMemo(() => safeParseArray(submissionsJson), [submissionsJson])
  const professorGrades = useMemo(() => safeParseArray(professorGradesJson), [professorGradesJson])

  const canRun = submissions.length > 0 && professorGrades.length > 0 && rubricText.trim().length > 0

  function handleSaveSettings() {
    saveApiSettings({ backend_api_base_url: backendUrl })
    alert('Backend URL saved. (Gemini key is not stored.)')
  }

  function handleUploadClick(which: 'submissions' | 'grades') {
    if (which === 'submissions') submissionsFileInputRef.current?.click()
    else gradesFileInputRef.current?.click()
  }

  function handleFileUpload(which: 'submissions' | 'grades', event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      if (which === 'submissions') setSubmissionsJson(text)
      else setProfessorGradesJson(text)
    }
    reader.readAsText(file)
  }

  async function handleGradeSubmissions() {
    try {
      setLoading(true)
      setEvaluation(null)
      setCalibration(null)

      if (!submissions.length) {
        alert('No submissions detected (must be a JSON array).')
        return
      }

      const normalized = submissions
        .map((row: any) => ({
          student_id: row.student_id || row.id || '',
          answer: row.answer || row.student_answer || row.answer_text || '',
          question_id: row.question_id || row.qid || questionId,
        }))
        .filter((row: any) => row.student_id && row.answer)

      const questionEntries = loadSavedQuestions()
        .map((q: any): [string, any] | null => {
          const id = String(q?.question_id || '').trim()
          return id ? [id, q] : null
        })
        .filter((x): x is [string, any] => Boolean(x))
      const questionById = new Map<string, any>(questionEntries)

      const enriched = normalized.map((row: any) => {
        const q: any = questionById.get(String(row.question_id || ''))
        const questionText =
          String(q?.question_text || q?.question || q?.text || '').trim() || `Question ${row.question_id}`
        const maxScore = Number(q?.max_score ?? 10)
        const benchmarkType = q?.benchmark_type ? String(q.benchmark_type) : undefined

        return {
          ...row,
          question_text: questionText,
          rubric: rubricText,
          max_score: Number.isFinite(maxScore) ? maxScore : 10,
          benchmark_type: benchmarkType,
        }
      })

      const result = await gradeBatch(enriched, { apiKey: geminiKey })
      setAiResults(result?.results || [])
    } catch (error: any) {
      alert(error?.message || 'Backend error while grading submissions.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunEvaluation() {
    try {
      setLoading(true)
      setCalibration(null)

      if (!aiResults?.length) {
        alert('Run AI grading first (Grade submissions).')
        return
      }

      const prof = professorGrades
        .map((row: any) => ({
          student_id: row.student_id || row.id || '',
          question_id: row.question_id || row.qid || questionId,
          score: Number(row.score ?? row.professor_score ?? row.grade ?? 0),
          max_score: row.max_score != null ? Number(row.max_score) : 10,
          comment: row.comment || row.professor_comment || '',
        }))
        .filter((row: any) => row.student_id)

      const payload = {
        ai_results: aiResults,
        professor_grades: prof,
        difference_threshold: differenceThreshold,
        include_semantic_metrics: false,
      }

      const result = await runEvaluation(payload as any, { apiKey: geminiKey })
      setEvaluation(result)
    } catch (error: any) {
      alert(error?.message || 'Backend error while running evaluation.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRunCalibration() {
    try {
      setLoading(true)
      setEvaluation(null)

      if (!canRun) {
        alert('Need: submissions + professor grades + rubric')
        return
      }

      const normalizedSubmissions = submissions
        .map((row: any) => ({
          student_id: row.student_id || row.id || '',
          answer: row.answer || row.student_answer || row.answer_text || '',
          question_id: row.question_id || row.qid || questionId,
        }))
        .filter((row: any) => row.student_id && row.answer)

      const questionEntries = loadSavedQuestions()
        .map((q: any): [string, any] | null => {
          const id = String(q?.question_id || '').trim()
          return id ? [id, q] : null
        })
        .filter((x): x is [string, any] => Boolean(x))
      const questionById = new Map<string, any>(questionEntries)
      const q: any = questionById.get(String(questionId || ''))
      const questionText = String(q?.question_text || q?.question || q?.text || '').trim() || `Question ${questionId}`

      const normalizedGrades = professorGrades
        .map((row: any) => ({
          student_id: row.student_id || row.id || '',
          question_id: row.question_id || row.qid || questionId,
          score: Number(row.score ?? row.professor_score ?? row.grade ?? 0),
          max_score: row.max_score != null ? Number(row.max_score) : 10,
          comment: row.comment || row.professor_comment || '',
        }))
        .filter((row: any) => row.student_id)

      const payload = {
        question_id: questionId,
        question_text: questionText,
        original_rubric: rubricText,
        submissions: normalizedSubmissions,
        professor_grades: normalizedGrades,
        max_rounds: maxRounds,
        difference_threshold: differenceThreshold,
        target_mse: targetMse.trim() ? Number(targetMse) : null,
        min_improvement: minImprovement,
        include_semantic_metrics: false,
      }

      const result = await runCalibration(payload as any, { apiKey: geminiKey })
      setCalibration(result)
    } catch (error: any) {
      alert(error?.message || 'Backend error while running calibration.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Evaluation Metrics</p>
          <h1>Evaluate & calibrate against ground truth</h1>
          <p className="subtle">
            Submissions + professor grades → rubric-based AI grading → compare vs ground truth → MSE/variance → revise rubric.
          </p>
        </div>

        <div className="export-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button type="button" className="ghost-btn" onClick={handleGradeSubmissions} disabled={loading}>
            {loading ? 'Working…' : 'Grade submissions'}
          </button>
          <button type="button" className="ghost-btn" onClick={handleRunEvaluation} disabled={loading}>
            Run evaluation
          </button>
          <button type="button" className="primary-btn" onClick={handleRunCalibration} disabled={loading}>
            Run calibration
          </button>
        </div>
      </section>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-head">
          <div>
            <h3>Settings</h3>
            <span className="tiny-label">User-provided tokens</span>
          </div>
          <button type="button" className="ghost-btn" onClick={handleSaveSettings}>
            Save settings
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
          <label className="field">
            <span className="tiny-label">Backend base URL</span>
            <input
              className="text-input"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8000"
            />
          </label>
          <label className="field">
            <span className="tiny-label">Gemini API Key</span>
            <input
              className="text-input"
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="GEMINI_API_KEY"
            />
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-head">
          <div>
            <h3>Calibration inputs</h3>
            <span className="tiny-label">Threshold + stopping rule</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <label className="field">
            <span className="tiny-label">Question ID</span>
            <input className="text-input" value={questionId} onChange={(e) => setQuestionId(e.target.value)} />
          </label>
          <label className="field">
            <span className="tiny-label">Diff threshold</span>
            <input
              className="text-input"
              value={differenceThreshold}
              onChange={(e) => setDifferenceThreshold(Number(e.target.value))}
              type="number"
              step="0.1"
              min="0"
            />
          </label>
          <label className="field">
            <span className="tiny-label">Max rounds</span>
            <input
              className="text-input"
              value={maxRounds}
              onChange={(e) => setMaxRounds(Number(e.target.value))}
              type="number"
              step="1"
              min="1"
            />
          </label>
          <label className="field">
            <span className="tiny-label">Min improvement</span>
            <input
              className="text-input"
              value={minImprovement}
              onChange={(e) => setMinImprovement(Number(e.target.value))}
              type="number"
              step="0.01"
              min="0"
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '12px' }}>
          <label className="field">
            <span className="tiny-label">Target MSE (optional)</span>
            <input
              className="text-input"
              value={targetMse}
              onChange={(e) => setTargetMse(e.target.value)}
              placeholder="e.g. 0.20"
            />
          </label>
          <label className="field">
            <span className="tiny-label">Rubric (text)</span>
            <textarea className="editor-textarea" style={{ minHeight: '92px' }} value={rubricText} onChange={(e) => setRubricText(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-head">
          <div>
            <h3>Inputs</h3>
            <span className="tiny-label">Submissions + professor grades (JSON arrays)</span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="ghost-btn" onClick={() => handleUploadClick('submissions')}>
              Upload submissions JSON
            </button>
            <button type="button" className="ghost-btn" onClick={() => handleUploadClick('grades')}>
              Upload grades JSON
            </button>
          </div>
        </div>

        <input
          ref={submissionsFileInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => handleFileUpload('submissions', e)}
        />
        <input
          ref={gradesFileInputRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => handleFileUpload('grades', e)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
          <div>
            <p className="tiny-label">Submissions (JSON array)</p>
            <textarea className="editor-textarea code-textarea" style={{ minHeight: '200px' }} value={submissionsJson} onChange={(e) => setSubmissionsJson(e.target.value)} />
            <p className="section-note" style={{ marginTop: '8px' }}>
              Parsed rows: <strong>{submissions.length}</strong>
            </p>
          </div>
          <div>
            <p className="tiny-label">Professor grades (ground truth, JSON array)</p>
            <textarea className="editor-textarea code-textarea" style={{ minHeight: '200px' }} value={professorGradesJson} onChange={(e) => setProfessorGradesJson(e.target.value)} />
            <p className="section-note" style={{ marginTop: '8px' }}>
              Parsed rows: <strong>{professorGrades.length}</strong>
            </p>
          </div>
        </div>
      </section>

      {(evaluation || calibration) && (
        <section className="panel" style={{ marginTop: '18px' }}>
          <div className="panel-head">
            <div>
              <h3>Results</h3>
              <span className="tiny-label">MSE + variance + flagged diffs</span>
            </div>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showFlaggedOnly}
                onChange={(e) => setShowFlaggedOnly(e.target.checked)}
              />
              <span className="tiny-label" style={{ margin: 0 }}>
                Show flagged only
              </span>
            </label>
          </div>

          {(() => {
            const source = evaluation || (calibration?.rounds ? calibration.rounds[calibration.best_round_index - 1]?.evaluation : null)
            const metrics = source?.metrics
            const comparisons = source?.comparisons || []
            const flaggedCases = source?.flagged_cases || []
            const rows = showFlaggedOnly ? flaggedCases : comparisons

            if (!source) {
              return <p className="section-note">No evaluation result found.</p>
            }

            return (
              <>
                <div className="result-overview" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '12px' }}>
                  <div className="metric-card">
                    <span>MSE</span>
                    <strong>{Number(metrics?.mse ?? 0).toFixed(4)}</strong>
                    <p>Lower is better</p>
                  </div>
                  <div className="metric-card">
                    <span>MAE</span>
                    <strong>{Number(metrics?.mae ?? 0).toFixed(4)}</strong>
                    <p>Lower is better</p>
                  </div>
                  <div className="metric-card">
                    <span>Score variance</span>
                    <strong>{Number(metrics?.score_variance ?? 0).toFixed(4)}</strong>
                    <p>AI score spread</p>
                  </div>
                  <div className="metric-card">
                    <span>Error variance</span>
                    <strong>{Number(metrics?.error_variance ?? 0).toFixed(4)}</strong>
                    <p>(AI - prof) spread</p>
                  </div>
                  <div className="metric-card">
                    <span>Flagged</span>
                    <strong>{Number(source?.flagged_count ?? 0)}</strong>
                    <p>abs diff &gt; {differenceThreshold}</p>
                  </div>
                </div>

                {calibration && (
                  <p className="section-note" style={{ marginTop: '12px' }}>
                    Best round: <strong>{calibration.best_round_index}</strong> | Completed: <strong>{calibration.completed_rounds}</strong> | Stop: <strong>{calibration.stopping_reason}</strong>
                  </p>
                )}

                <div className="table-wrap" style={{ marginTop: '14px' }}>
                  <table className="clean-table clean-table--compact">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>QID</th>
                        <th>AI</th>
                        <th>Professor</th>
                        <th>Abs diff</th>
                        <th>AI comment</th>
                        <th>Professor comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length ? (
                        rows.map((row: any) => (
                          <tr key={`${row.student_id}-${row.question_id}`}
                            style={{ background: row.flagged ? 'var(--warning-bg)' : undefined }}
                          >
                            <td className="mono-cell">{row.student_id}</td>
                            <td className="mono-cell">{row.question_id}</td>
                            <td>{row.ai_score}</td>
                            <td>{row.professor_score}</td>
                            <td>{Number(row.abs_difference ?? 0).toFixed(2)}</td>
                            <td>{row.ai_reasoning || ''}</td>
                            <td>{row.professor_comment || ''}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="center-col">No rows to show.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
        </section>
      )}
    </main>
  )
}