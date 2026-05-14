import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadApiSettings,
  runCalibration,
  runEvaluation,
  saveApiSettings,
} from '../lib/api'

type Tab = 'evaluate' | 'calibrate'

type SavedQuestion = {
  question_id: string
  question?: string
  question_text?: string
  text?: string
  max_score?: number
  benchmark_type?: string
}

function loadSavedQuestions(): SavedQuestion[] {
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

function loadSavedGradingResults(): any[] {
  try {
    const raw = window.localStorage.getItem('grading_results')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const results = parsed?.results
    return Array.isArray(results) ? results : []
  } catch {
    return []
  }
}

function loadSavedSubmissions(): any[] {
  try {
    const raw = window.localStorage.getItem('grading_submissions')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function questionLabel(q: SavedQuestion): string {
  const text = String(q.question_text || q.question || q.text || '').trim()
  const preview = text.length > 60 ? text.slice(0, 57) + '…' : text
  return preview ? `${q.question_id} — ${preview}` : q.question_id
}

const ALL_QUESTIONS = '__ALL__'

// Flatten professor grades JSON into a flat list. Supports two shapes:
//   1) Flat:    [{ student_id, question_id, score, max_score | score_max, comment? }, ...]
//   2) Nested:  [{ student_id, grades: [{ question_id, original_question_id?, score, score_max | max_score, comment? }] }, ...]
// When original_question_id is present, it's preferred as the match key because rubrics
// are keyed by the original question_id from Question Upload (not by per-exam variants).
// Flat row keeps BOTH question_id (per-exam) and original_question_id so the
// filter can match against either — useful when `grading_questions` uses one
// id form (e.g. `final_q3`) and `professor_grades` uses the other (`q3`).
function flattenProfGrades(rows: any[]): any[] {
  const out: any[] = []
  for (const row of rows || []) {
    if (Array.isArray(row?.grades)) {
      for (const g of row.grades) {
        out.push({
          student_id: row.student_id || row.id || '',
          question_id: String(g.question_id || g.qid || ''),
          original_question_id: String(g.original_question_id || ''),
          score: Number(g.score ?? g.professor_score ?? g.grade ?? 0),
          max_score: Number(g.score_max ?? g.max_score ?? 10),
          comment: g.comment || g.professor_comment || '',
        })
      }
    } else {
      out.push({
        student_id: row.student_id || row.id || '',
        question_id: String(row.question_id || row.qid || ''),
        original_question_id: String(row.original_question_id || ''),
        score: Number(row.score ?? row.professor_score ?? row.grade ?? 0),
        max_score: Number(row.score_max ?? row.max_score ?? 10),
        comment: row.comment || row.professor_comment || '',
      })
    }
  }
  return out.filter((r) => r.student_id)
}

const professorGradesTemplate = `[
  {
    "student_id": "S001",
    "question_id": "q1",
    "score": 8,
    "max_score": 10,
    "comment": "Good but missing detail."
  }
]`

export default function EvaluationPage() {
  const [tab, setTab] = useState<Tab>('evaluate')

  // Auto-loaded from localStorage
  const [savedQuestions, setSavedQuestions] = useState<SavedQuestion[]>([])
  const [savedRubrics, setSavedRubrics] = useState<Record<string, string>>({})
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [savedSubmissions, setSavedSubmissions] = useState<any[]>([])

  // Shared selections / inputs
  const [selectedQid, setSelectedQid] = useState<string>('')
  const [professorGradesJson, setProfessorGradesJson] = useState(professorGradesTemplate)
  const [rubricOverride, setRubricOverride] = useState('')

  // Advanced knobs (collapsed)
  const [differenceThreshold, setDifferenceThreshold] = useState(0.5)
  const [maxRounds, setMaxRounds] = useState(5)
  const [minImprovement, setMinImprovement] = useState(0.01)
  const [targetMse, setTargetMse] = useState<string>('')

  // Settings (collapsed)
  const [backendUrl, setBackendUrl] = useState('')
  const [geminiKey, setGeminiKey] = useState('')

  // Output state
  const [evaluation, setEvaluation] = useState<any | null>(null)
  const [calibration, setCalibration] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(true)
  const [gradesView, setGradesView] = useState<'table' | 'json'>('table')

  const gradesFileInputRef = useRef<HTMLInputElement | null>(null)

  // ----- Hydrate on mount -----
  useEffect(() => {
    // Scroll to top when this page mounts (e.g. navigating from Submission Grading).
    window.scrollTo({ top: 0, behavior: 'auto' })

    setBackendUrl(loadApiSettings().backend_api_base_url)
    const qs = loadSavedQuestions()
    const rubrics = loadSavedRubrics()
    const results = loadSavedGradingResults()
    const submissions = loadSavedSubmissions()
    setSavedQuestions(qs)
    setSavedRubrics(rubrics)
    setSavedResults(results)
    setSavedSubmissions(submissions)

    // Pick a sensible default question.
    if (qs.length) {
      const fromResults = results[0]?.question_id
      const initial = (fromResults && qs.find((q) => q.question_id === fromResults))
        ? fromResults
        : qs[0].question_id
      setSelectedQid(String(initial))
    }

    // One-shot demo prefill: if HomePage seeded professor grades for the demo,
    // drop them into the textarea and consume the flag so re-visits don't clobber edits.
    if (window.localStorage.getItem('grading_demo_eval_prefill') === '1') {
      const payload = window.localStorage.getItem('grading_demo_professor_grades') || ''
      if (payload) setProfessorGradesJson(payload)
      window.localStorage.removeItem('grading_demo_eval_prefill')
      window.localStorage.removeItem('grading_demo_professor_grades')
    }
  }, [])

  // Whenever the selected question changes, sync the override textarea with the
  // saved rubric for that question so the box isn't empty when the user opens it.
  useEffect(() => {
    if (selectedQid === ALL_QUESTIONS) {
      setRubricOverride('')
      return
    }
    setRubricOverride(savedRubrics[selectedQid] || '')
  }, [selectedQid, savedRubrics])

  // Question metadata for the selected question.
  const selectedQuestion = useMemo(
    () => savedQuestions.find((q) => q.question_id === selectedQid),
    [savedQuestions, selectedQid],
  )

  // Resolved rubric: prefer override (which is pre-synced from savedRubrics by the effect above).
  const resolvedRubric = useMemo(() => {
    if (rubricOverride.trim()) return rubricOverride
    return savedRubrics[selectedQid] || ''
  }, [rubricOverride, savedRubrics, selectedQid])

  const isAllQuestions = selectedQid === ALL_QUESTIONS

  // AI grades filtered to selected question (or all if __ALL__).
  const aiResultsForQuestion = useMemo(() => {
    if (isAllQuestions) return savedResults
    return savedResults.filter((r) => String(r.question_id) === selectedQid)
  }, [savedResults, selectedQid, isAllQuestions])

  // Flattened professor grades — supports nested {grades:[]} and flat shapes.
  const flatProfGrades = useMemo(() => {
    try {
      const parsed = JSON.parse(professorGradesJson)
      const arr = Array.isArray(parsed) ? parsed : []
      return flattenProfGrades(arr)
    } catch {
      return [] as any[]
    }
  }, [professorGradesJson])

  // Professor grades filtered to the selected question (or all). Match against
  // EITHER question_id or original_question_id so users can use per-exam ids
  // (e.g. "final_q3") in grading_questions and canonical ids ("q3") in the
  // professor grades file — or vice versa.
  const professorGrades = useMemo(() => {
    if (isAllQuestions) return flatProfGrades
    return flatProfGrades.filter(
      (g) => g.question_id === selectedQid || g.original_question_id === selectedQid,
    )
  }, [flatProfGrades, selectedQid, isAllQuestions])

  const submissionsForQuestion = useMemo(() => {
    if (isAllQuestions) return savedSubmissions
    return savedSubmissions.filter((s) => String(s.question_id || '') === selectedQid)
  }, [savedSubmissions, selectedQid, isAllQuestions])

  // ----- Handlers -----

  function handleSaveSettings() {
    saveApiSettings({ backend_api_base_url: backendUrl })
    alert('Backend URL saved.')
  }

  function handleUploadGrades() {
    gradesFileInputRef.current?.click()
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setProfessorGradesJson(text)
    }
    reader.readAsText(file)
  }

  function normalizeProfGrades() {
    // `professorGrades` is already flattened + filtered. Rewrite question_id so
    // the backend join with AI grades works regardless of which id form the
    // source file used. For single-question mode that's selectedQid. For "All",
    // prefer original_question_id since AI grades are keyed by it.
    return professorGrades.map((g: any) => ({
      student_id: g.student_id,
      question_id: isAllQuestions
        ? (g.original_question_id || g.question_id)
        : selectedQid,
      score: g.score,
      max_score: g.max_score,
      comment: g.comment,
    }))
  }

  async function handleRunEvaluation() {
    try {
      setLoading(true)
      setEvaluation(null)
      setCalibration(null)

      if (!aiResultsForQuestion.length) {
        alert(
          'No saved AI grades for this question. Run grading on the Submission Grading page first.',
        )
        return
      }
      if (!professorGrades.length) {
        alert('Please provide professor grades (upload or paste).')
        return
      }

      const payload = {
        ai_results: aiResultsForQuestion,
        professor_grades: normalizeProfGrades(),
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
      setCalibration(null)

      if (!resolvedRubric.trim()) {
        alert('No rubric found for this question. Generate one on the Question Upload page first, or paste an override.')
        return
      }
      if (!submissionsForQuestion.length) {
        alert(
          'No saved submissions for this question. Run grading on the Submission Grading page first so the answers are available.',
        )
        return
      }
      if (!professorGrades.length) {
        alert('Please provide professor grades (upload or paste).')
        return
      }

      const questionText = String(
        selectedQuestion?.question_text ||
          selectedQuestion?.question ||
          selectedQuestion?.text ||
          `Question ${selectedQid}`,
      )

      const normalizedSubmissions = submissionsForQuestion.map((row: any) => ({
        student_id: row.student_id,
        question_id: row.question_id || selectedQid,
        answer: row.answer || row.student_answer || row.answer_text || '',
      }))

      const payload = {
        question_id: selectedQid,
        question_text: questionText,
        original_rubric: resolvedRubric,
        submissions: normalizedSubmissions,
        professor_grades: normalizeProfGrades(),
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

  // ----- Render helpers -----

  const evalReady = aiResultsForQuestion.length > 0
  const rubricReady = Boolean(resolvedRubric.trim())
  const submissionsReady = submissionsForQuestion.length > 0

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Evaluation</p>
          <h1>Evaluation & Calibration</h1>
          <p className="subtle">
            Compare tool grades to professor grades and improve the rubric.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`status-pill ${evalReady ? 'status-pill--success' : 'status-pill--warning'}`}>
            {evalReady ? `✓ ${aiResultsForQuestion.length} AI grades loaded` : '⚠ No AI grades for this question'}
          </span>
          <span className={`status-pill ${rubricReady ? 'status-pill--success' : 'status-pill--warning'}`}>
            {rubricReady ? '✓ Rubric loaded' : '⚠ No rubric'}
          </span>
        </div>
      </section>

      {/* ─── Tab bar ────────────────────────────────────────────────── */}
      <section className="panel" style={{ padding: '6px', marginTop: '18px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            className={tab === 'evaluate' ? 'primary-btn' : 'ghost-btn'}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setTab('evaluate')}
          >
            Evaluation
          </button>
          <button
            type="button"
            className={tab === 'calibrate' ? 'primary-btn' : 'ghost-btn'}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => setTab('calibrate')}
          >
            Calibration
          </button>
        </div>
      </section>

      {/* ─── Shared inputs ──────────────────────────────────────────── */}
      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-head">
          <div>
            <h3>Step 1 — Choose a question</h3>
            <span className="tiny-label">Loaded from Question Upload</span>
          </div>
        </div>

        {savedQuestions.length ? (
          <label className="field">
            <span className="tiny-label">Question</span>
            <select
              className="select-input"
              value={selectedQid}
              onChange={(e) => setSelectedQid(e.target.value)}
            >
              <option value={ALL_QUESTIONS}>All questions ({savedQuestions.length})</option>
              {savedQuestions.map((q) => (
                <option key={q.question_id} value={q.question_id}>
                  {questionLabel(q)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="section-note">
            No questions saved yet. Go to <strong>Question Upload</strong> first.
          </p>
        )}

        {isAllQuestions ? (
          <p className="section-note" style={{ marginTop: '8px' }}>
            Evaluation will pool AI grades + professor grades across <strong>all {savedQuestions.length} questions</strong>.
            Calibration is per-question — pick a specific question to run it.
          </p>
        ) : (
          selectedQuestion && (
            <p className="section-note" style={{ marginTop: '8px' }}>
              Max score: <strong>{selectedQuestion.max_score ?? 10}</strong>
            </p>
          )
        )}

        {/* Rubric preview / override — only for single-question mode. */}
        {!isAllQuestions && (
          <details style={{ marginTop: '14px' }} open={!rubricReady}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              {rubricReady ? 'View / override rubric' : 'No rubric — paste one here'}
            </summary>
            <textarea
              className="editor-textarea"
              style={{ minHeight: '120px', marginTop: '10px' }}
              value={rubricOverride}
              onChange={(e) => setRubricOverride(e.target.value)}
              placeholder="Rubric criteria (one per line) with point ranges"
            />
          </details>
        )}
      </section>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-head">
          <div>
            <h3>Step 2 — Provide professor grades</h3>
            <span className="tiny-label">Ground truth for the selected question</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div role="tablist" aria-label="Grades view" style={{ display: 'inline-flex', border: '1px solid #d6dbe6', borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                role="tab"
                aria-selected={gradesView === 'table'}
                onClick={() => setGradesView('table')}
                className={gradesView === 'table' ? 'primary-btn' : 'ghost-btn'}
                style={{ borderRadius: 0, padding: '4px 12px', fontSize: '0.85rem' }}
              >
                Table
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={gradesView === 'json'}
                onClick={() => setGradesView('json')}
                className={gradesView === 'json' ? 'primary-btn' : 'ghost-btn'}
                style={{ borderRadius: 0, padding: '4px 12px', fontSize: '0.85rem' }}
              >
                JSON
              </button>
            </div>
            <button type="button" className="ghost-btn" onClick={handleUploadGrades}>
              Upload JSON
            </button>
            <input
              ref={gradesFileInputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        {gradesView === 'table' ? (
          flatProfGrades.length > 0 ? (
            <div className="table-wrap">
              <table className="clean-table clean-table--compact">
                <thead>
                  <tr>
                    <th className="center-col" style={{ width: 48 }}>#</th>
                    <th style={{ width: 120 }}>Student ID</th>
                    <th style={{ width: 100 }}>Question ID</th>
                    <th style={{ width: 100 }}>Score</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {flatProfGrades.map((g: any, idx: number) => (
                    <tr key={`${g.student_id}-${g.question_id}-${idx}`}>
                      <td className="center-col">{idx + 1}</td>
                      <td className="mono-cell">{g.student_id}</td>
                      <td className="mono-cell">{g.question_id || '—'}</td>
                      <td><strong>{g.score}/{g.max_score}</strong></td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--ink-700, #444)' }}>{g.comment || <span className="subtle">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="section-note" style={{ marginTop: 12 }}>
              No grades parsed yet — switch to <strong>JSON</strong> view to paste or edit input.
            </p>
          )
        ) : (
          <textarea
            className="editor-textarea code-textarea"
            style={{ minHeight: '160px' }}
            value={professorGradesJson}
            onChange={(e) => setProfessorGradesJson(e.target.value)}
          />
        )}
        <p className="section-note" style={{ marginTop: '8px' }}>
          Parsed rows: <strong>{flatProfGrades.length}</strong> total
          {!isAllQuestions && (
            <>
              {' '}· <strong>{professorGrades.length}</strong> for {selectedQid || 'this question'}
              {flatProfGrades.length > 0 && professorGrades.length === 0 && (
                <span style={{ color: '#b3261e' }}>
                  {' '}— no row's <code>question_id</code> or <code>original_question_id</code> matches <code>{selectedQid}</code>.
                </span>
              )}
            </>
          )}
        </p>
      </section>

      {/* ─── Settings ──────────────────────────────────────── */}
      <section className="panel" style={{ marginTop: '18px' }}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Settings</summary>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginTop: '14px' }}>
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
            {tab === 'calibrate' && (
              <>
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
                <label className="field">
                  <span className="tiny-label">Target MSE (optional)</span>
                  <input
                    className="text-input"
                    value={targetMse}
                    onChange={(e) => setTargetMse(e.target.value)}
                    placeholder="e.g. 0.20"
                  />
                </label>
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginTop: '14px' }}>
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
              <span className="tiny-label">API key (not stored)</span>
              <input
                className="text-input"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="API_KEY"
              />
            </label>
          </div>

          <button type="button" className="ghost-btn" style={{ marginTop: '12px' }} onClick={handleSaveSettings}>
            Save backend URL
          </button>
        </details>
      </section>

      {/* ─── Action button per tab ─────────────────────────────────── */}
      <section className="panel" style={{ marginTop: '18px' }}>
        {tab === 'evaluate' ? (
          <>
            <p className="section-note">
              Compares the saved AI grades for this question against the professor grades you provided.
              No new grading runs.
            </p>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '12px' }}
              onClick={handleRunEvaluation}
              disabled={loading || !evalReady || !professorGrades.length}
            >
              {loading ? 'Working…' : 'Run Evaluation'}
            </button>
          </>
        ) : (
          <>
            <p className="section-note">
              Iteratively revises the rubric over multiple rounds, re-grades, and tracks MSE.
              Uses the current rubric as round 1.
            </p>
            {isAllQuestions && (
              <p className="section-note" style={{ color: '#b3261e', marginTop: '8px' }}>
                ⚠ Calibration only runs one question at a time. Pick a specific question above.
              </p>
            )}
            {!isAllQuestions && !submissionsReady && (
              <p className="section-note" style={{ color: '#b3261e', marginTop: '8px' }}>
                ⚠ No saved submissions for this question. Run grading first so calibration has the answers to re-grade.
              </p>
            )}
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '12px' }}
              onClick={handleRunCalibration}
              disabled={loading || isAllQuestions || !rubricReady || !submissionsReady || !professorGrades.length}
            >
              {loading ? 'Working…' : 'Start Calibration'}
            </button>
          </>
        )}
      </section>

      {/* ─── Results ──────────────────────────────────────────────── */}
      {(evaluation || calibration) && (
        <section className="panel" style={{ marginTop: '18px' }}>
          <div className="panel-head">
            <div>
              <h3>Results</h3>
              <span className="tiny-label">
                {evaluation ? 'Evaluation' : `Calibration · best round ${calibration?.best_round_index}`}
              </span>
            </div>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showFlaggedOnly}
                onChange={(e) => setShowFlaggedOnly(e.target.checked)}
              />
              <span className="tiny-label" style={{ margin: 0 }}>Show flagged only</span>
            </label>
          </div>

          {(() => {
            const source =
              evaluation ||
              (calibration?.rounds
                ? calibration.rounds[calibration.best_round_index - 1]?.evaluation
                : null)
            const metrics = source?.metrics
            const comparisons = source?.comparisons || []
            const flaggedCases = source?.flagged_cases || []
            const rows = showFlaggedOnly ? flaggedCases : comparisons
            const total = comparisons.length
            const flaggedCount = Number(source?.flagged_count ?? 0)
            const withinPct = metrics?.within_threshold_rate != null
              ? Math.round(Number(metrics.within_threshold_rate) * 100)
              : null

            if (!source) {
              return <p className="section-note">No evaluation result found.</p>
            }

            return (
              <>
                <div
                  className="result-overview"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <div className="metric-card">
                    <span>MSE</span>
                    <strong>{Number(metrics?.mse ?? 0).toFixed(4)}</strong>
                    <p>Avg squared gap between AI &amp; professor. Lower = closer match.</p>
                  </div>
                  <div className="metric-card">
                    <span>MAE</span>
                    <strong>{Number(metrics?.mae ?? 0).toFixed(4)}</strong>
                    <p>Avg absolute point difference per grade.</p>
                  </div>
                  <div className="metric-card">
                    <span>Within ±{differenceThreshold}</span>
                    <strong>{withinPct != null ? `${withinPct}%` : '—'}</strong>
                    <p>
                      {withinPct != null
                        ? `${withinPct}% of AI scores agree with the professor within ±${differenceThreshold}.`
                        : 'Share of AI scores close to the professor.'}
                    </p>
                  </div>
                  <div className="metric-card">
                    <span>Score variance</span>
                    <strong>{Number(metrics?.score_variance ?? 0).toFixed(4)}</strong>
                    <p>How spread out the AI scores are across students.</p>
                  </div>
                  <div className="metric-card">
                    <span>Flagged</span>
                    <strong>{flaggedCount}</strong>
                    <p>
                      {flaggedCount === 0
                        ? `No grades differ by more than ${differenceThreshold} from the professor.`
                        : `${flaggedCount} of ${total} grades differ by more than ${differenceThreshold}.`}
                    </p>
                  </div>
                </div>

                {calibration && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '12px 14px',
                      background: 'var(--info-bg, #eef4ff)',
                      border: '1px solid var(--brand-200, #c7d7ff)',
                      borderRadius: '10px',
                    }}
                  >
                    <p style={{ margin: 0 }}>
                      <strong>Best round:</strong> {calibration.best_round_index} of {calibration.completed_rounds} ·{' '}
                      <strong>Best MSE:</strong> {Number(calibration.best_mse ?? 0).toFixed(4)} ·{' '}
                      <strong>Stop reason:</strong> {calibration.stopping_reason}
                    </p>
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Round-by-round MSE</summary>
                      <ul style={{ marginTop: '8px' }}>
                        {(calibration.rounds || []).map((round: any) => (
                          <li key={round.round_index}>
                            Round {round.round_index}: MSE{' '}
                            <strong>{Number(round.evaluation?.metrics?.mse ?? 0).toFixed(4)}</strong>
                            {round.revision_note && (
                              <span style={{ color: 'var(--ink-600)' }}> — {round.revision_note.split('\n')[0]}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                    <details style={{ marginTop: '8px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Best rubric (round {calibration.best_round_index})</summary>
                      <pre
                        style={{
                          marginTop: '8px',
                          padding: '12px',
                          background: 'rgba(0,0,0,0.04)',
                          borderRadius: '8px',
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.85rem',
                        }}
                      >
                        {typeof calibration.best_rubric === 'string'
                          ? calibration.best_rubric
                          : JSON.stringify(calibration.best_rubric, null, 2)}
                      </pre>
                    </details>
                  </div>
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
                        <th>AI reasoning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length ? (
                        rows.map((row: any) => (
                          <tr
                            key={`${row.student_id}-${row.question_id}`}
                            style={{ background: row.flagged ? 'var(--warning-bg)' : undefined }}
                          >
                            <td className="mono-cell">{row.student_id}</td>
                            <td className="mono-cell">{row.question_id}</td>
                            <td>{row.ai_score}</td>
                            <td>{row.professor_score}</td>
                            <td>{Number(row.abs_difference ?? 0).toFixed(2)}</td>
                            <td>{row.ai_reasoning || ''}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="center-col">No rows to show.</td>
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
