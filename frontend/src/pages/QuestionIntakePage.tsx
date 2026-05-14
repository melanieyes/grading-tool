import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { generateRubric, reviseRubricLLM } from '../lib/api'

type RowStatus = 'draft' | 'approved' | 'revised'
type RevisionMode = 'manual' | 'suggested'

const revisionOptions = [
  'Criteria are too generic',
  'Scoring weights are unclear',
  'Rubric does not match reasoning depth',
  'Need more partial-credit guidance',
  'Expected key points are missing',
]

const jsonTemplate = `[
  {
    "question_id": "q1",
    "question": "Explain why deadlock happens and how resource ordering prevents it.",
    "max_score": 10
  },
  {
    "question_id": "q2",
    "question": "Compare paging and segmentation in memory management.",
    "max_score": 10
  }
]`

function flattenJsonQuestions(data: any): any[] {
  if (Array.isArray(data)) return data

  if (!data?.questions || !Array.isArray(data.questions)) return []

  return data.questions.flatMap((q: any) => {
    if (q.subparts && Array.isArray(q.subparts)) {
      return q.subparts.map((part: any) => ({
        question_id: part.part_id || part.question_id,
        question: part.question_text || part.question || '',
        max_score: part.points || q.points || 10,
        benchmark_type: q.benchmark_type || '',
      }))
    }

    return {
      question_id: q.question_id || q.id,
      question: q.question_text || q.question || '',
      max_score: q.points || q.max_score || 10,
      benchmark_type: q.benchmark_type || '',
    }
  })
}

function flattenQuestionsFromSubmissions(data: any): any[] {
  if (!Array.isArray(data)) return []

  const candidates = data
    .map((row: any) => {
      const question_id = row.question_id || row.qid || ''
      const question = row.question || row.question_text || row.prompt || ''
      const max_score = Number(row.max_score || row.points || row.score_max || 10)
      const benchmark_type = row.benchmark_type || ''
      return { question_id, question, max_score, benchmark_type }
    })
    .filter((q: any) => q.question_id && q.question)

  const uniq: Record<string, any> = {}
  candidates.forEach((q: any) => {
    if (!uniq[q.question_id]) uniq[q.question_id] = q
  })

  return Object.values(uniq)
}

function parseJson(text: string) {
  try {
    const parsed = JSON.parse(text)
    const fromQuestions = flattenJsonQuestions(parsed).filter((q) => q.question_id && q.question)
    if (fromQuestions.length) return fromQuestions
    return flattenQuestionsFromSubmissions(parsed)
  } catch {
    return []
  }
}

function loadSavedRubrics() {
  try {
    const saved = localStorage.getItem('grading_rubrics')
    if (!saved) return {}
    const parsed = JSON.parse(saved)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function allocatePoints(maxScore: number, weights: number[]) {
  const cleanedMax = Number.isFinite(maxScore) && maxScore > 0 ? Math.round(maxScore) : 10
  const cleanedWeights = weights.map((w) => Math.max(0, Number.isFinite(w) ? w : 0))
  const total = cleanedWeights.reduce((sum, w) => sum + w, 0) || 1
  const raw = cleanedWeights.map((w) => (cleanedMax * w) / total)

  const floored = raw.map((x) => Math.floor(x))
  let remaining = cleanedMax - floored.reduce((sum, n) => sum + n, 0)

  const order = raw
    .map((x, idx) => ({ idx, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac)

  for (let i = 0; i < order.length && remaining > 0; i++) {
    floored[order[i].idx] += 1
    remaining -= 1
  }

  return floored
}

function improveRubricForQuestion(params: {
  questionText: string
  maxScore: number
  revisionFocus: string
}) {
  const question = params.questionText.trim()
  const focus = params.revisionFocus.trim() || 'Improve reasoning depth and partial-credit clarity'
  const [p1, p2, p3, p4] = allocatePoints(params.maxScore, [0.3, 0.3, 0.2, 0.2])

  return [
    `Revision focus: ${focus}`,
    '',
    `Question: ${question}`,
    '',
    `- Conceptual accuracy and correct definitions (0-${p1})`,
    `- Step-by-step reasoning and logical justification (0-${p2})`,
    `- Applies to the specific prompt (0-${p3})`,
    `- Completeness, precision, and clarity (0-${p4})`,
    '- Full credit: directly addresses the prompt, uses correct theory, and explains why the conclusion follows.',
    '- Partial credit: relevant concepts but incomplete reasoning, missing steps, or weak explanation.',
    '- Low credit: generic, unsupported, or only states a conclusion.',
    '- Manual review trigger: contradictions, hallucinated facts, vague reasoning, or unusually short response.',
  ].join('\n')
}

export default function QuestionUploadPage() {
  const [jsonInput, setJsonInput] = useState(jsonTemplate)
  const [fileName, setFileName] = useState('')

  const [rubrics, setRubrics] = useState<Record<string, string>>({})
  const [rowStatuses, setRowStatuses] = useState<Record<string, RowStatus>>({})
  const [globalStatus, setGlobalStatus] = useState<'draft' | 'generated'>('draft')
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null)
  const [revisionMode, setRevisionMode] = useState<RevisionMode>('suggested')
  const [selectedReason, setSelectedReason] = useState(revisionOptions[0])
  const [reviewerComment, setReviewerComment] = useState('')
  const [revisionOriginalRubric, setRevisionOriginalRubric] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const rubricPanelRef = useRef<HTMLElement | null>(null)

  const questions = useMemo(() => parseJson(jsonInput), [jsonInput])

  useEffect(() => {
    if (questions.length > 0) {
      localStorage.setItem('grading_questions', JSON.stringify(questions))
    }
  }, [questions])

  useEffect(() => {
    const savedRubrics = loadSavedRubrics()
    if (savedRubrics && Object.keys(savedRubrics).length) {
      setRubrics(savedRubrics)
    }
    try {
      const raw = localStorage.getItem('grading_row_statuses')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setRowStatuses(parsed)
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  useEffect(() => {
    if (!questions.length) {
      setGlobalStatus('draft')
      return
    }
    const allHaveRubric = questions.every(
      (q: any) => typeof rubrics[q.question_id] === 'string' && rubrics[q.question_id].trim().length > 0,
    )
    setGlobalStatus(allHaveRubric ? 'generated' : 'draft')
  }, [questions, rubrics])

  useEffect(() => {
    if (Object.keys(rubrics).length) {
      localStorage.setItem('grading_rubrics', JSON.stringify(rubrics))
    }
  }, [rubrics])

  useEffect(() => {
    if (Object.keys(rowStatuses).length) {
      localStorage.setItem('grading_row_statuses', JSON.stringify(rowStatuses))
    }
  }, [rowStatuses])

  const isValid = questions.length > 0

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

  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [progressDone, setProgressDone] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [smoothProgress, setSmoothProgress] = useState(0)
  const [justGenerated, setJustGenerated] = useState(false)
  const [revisingId, setRevisingId] = useState<string | null>(null)
  const generationStartRef = useRef<number>(0)

  useEffect(() => {
    if (!isGenerating || progressTotal === 0) return
    const tick = () => {
      const elapsed = Date.now() - generationStartRef.current
      const expectedMs = Math.max(8000, progressTotal * 9000)
      const realPct = (progressDone / progressTotal) * 100
      const timePct = Math.min(95, (elapsed / expectedMs) * 100)
      setSmoothProgress((prev) => Math.max(prev, realPct, timePct))
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [isGenerating, progressDone, progressTotal])

  function fallbackRubricFor(maxScore: number) {
    const safe = Number.isFinite(maxScore) && maxScore > 0 ? Math.round(maxScore) : 10
    return `- Correct concept (0-${Math.floor(safe / 2)})\n- Clear reasoning (0-${Math.ceil(safe / 2)})`
  }

  async function handleGenerateAllRubrics() {
    if (!questions.length || isGenerating) return

    setIsGenerating(true)
    setGenerationError(null)
    setJustGenerated(false)
    setProgressDone(0)
    setProgressTotal(questions.length)
    setSmoothProgress(0)
    generationStartRef.current = Date.now()

    rubricPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    const payloadQuestions = questions.map((q: any) => ({
      question_id: String(q.question_id),
      question_text: String(q.question ?? q.question_text ?? ''),
      max_score: Number(q.max_score || 10),
    }))

    const newStatuses: Record<string, RowStatus> = {}
    questions.forEach((q: any) => {
      newStatuses[q.question_id] = 'draft'
    })
    setRowStatuses(newStatuses)
    setActiveRevisionId(null)

    let failed = 0

    await Promise.all(
      payloadQuestions.map(async (q) => {
        try {
          const response = await generateRubric({ questions: [q] })
          const text = response.rubrics?.[q.question_id]
          const finalText = text && text.trim() ? text : fallbackRubricFor(q.max_score)
          if (!text || !text.trim()) failed += 1
          setRubrics((prev) => ({ ...prev, [q.question_id]: finalText }))
        } catch {
          failed += 1
          setRubrics((prev) => ({ ...prev, [q.question_id]: fallbackRubricFor(q.max_score) }))
        } finally {
          setProgressDone((n) => n + 1)
        }
      }),
    )

    setSmoothProgress(100)
    setIsGenerating(false)
    if (failed > 0) {
      setGenerationError(
        `${failed} of ${payloadQuestions.length} rubric(s) failed; used a basic template for those.`,
      )
    }
    setJustGenerated(true)
    window.setTimeout(() => setJustGenerated(false), 2500)
  }

  function handleRubricChange(id: string, newText: string) {
    setRubrics((prev) => ({ ...prev, [id]: newText }))
  }

  function handleAcceptRow(id: string) {
    setRowStatuses((prev) => ({ ...prev, [id]: 'approved' }))
    if (activeRevisionId === id) setActiveRevisionId(null)
  }

  function handleOpenRevision(id: string) {
    setActiveRevisionId(id)
    setRevisionMode('suggested')
    setSelectedReason(revisionOptions[0])
    setReviewerComment('')
    setRevisionOriginalRubric(rubrics[id] || '')
    // If they revise after accepting, treat as draft until accepted again.
    setRowStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === 'approved' ? 'draft' : (prev[id] || 'draft'),
    }))
  }

  function handleCloseRevision(id: string) {
    const current = rubrics[id] || ''
    if (revisionMode === 'manual' && current.trim() && current !== revisionOriginalRubric) {
      setRowStatuses((prev) => ({ ...prev, [id]: 'revised' }))
    }
    setActiveRevisionId(null)
  }

  async function handleGenerateSuggestedRevision(id: string, questionText: string, maxScore: number) {
    if (revisingId) return
    const focus = (reviewerComment.trim() || selectedReason.trim() || 'Improve reasoning depth and partial-credit clarity')
    const currentRubric = rubrics[id] || ''

    setRevisingId(id)
    try {
      const response = await reviseRubricLLM({
        question_id: id,
        question_text: questionText,
        current_rubric: currentRubric,
        revision_focus: focus,
        max_score: maxScore,
      })
      const next = (response.rubric_text && response.rubric_text.trim())
        ? response.rubric_text
        : improveRubricForQuestion({ questionText, maxScore, revisionFocus: focus })
      setRubrics((prev) => ({ ...prev, [id]: next }))
      setRowStatuses((prev) => ({ ...prev, [id]: 'revised' }))
      setActiveRevisionId(null)
    } catch (err: any) {
      const fallback = improveRubricForQuestion({ questionText, maxScore, revisionFocus: focus })
      setRubrics((prev) => ({ ...prev, [id]: fallback }))
      setRowStatuses((prev) => ({ ...prev, [id]: 'revised' }))
      setActiveRevisionId(null)
      setGenerationError(`Revise via API failed (${err?.message ?? 'unknown'}). Used local template.`)
      window.setTimeout(() => setGenerationError(null), 3000)
    } finally {
      setRevisingId(null)
    }
  }

  const renderRubricCell = (id: string, questionText: string, maxScore: number) => {
    const status = rowStatuses[id] || 'draft'
    const isApproved = status === 'approved'
    const isRevising = activeRevisionId === id
    const allowManualEdit = isRevising && revisionMode === 'manual'

    if (globalStatus === 'draft') {
      return (
        <td>
          <textarea
            className="editor-textarea preview-textarea"
            style={{ minHeight: '120px' }}
            readOnly
            placeholder="Waiting for generation..."
          />
        </td>
      )
    }

    return (
      <td>
        <textarea
          className={`editor-textarea ${!allowManualEdit ? 'preview-textarea' : ''}`}
          style={{ minHeight: '120px', padding: '12px' }}
          value={rubrics[id] || ''}
          onChange={(e) => handleRubricChange(id, e.target.value)}
          readOnly={isApproved || !allowManualEdit}
          placeholder={allowManualEdit ? 'Edit rubric manually…' : ''}
        />

        {activeRevisionId === id && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: 'var(--info-bg)',
              borderRadius: '12px',
              border: '1px solid var(--brand-200)',
            }}
          >
            <p className="tiny-label" style={{ marginBottom: '10px', color: 'var(--brand-700)' }}>
              Revise rubric
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
              <label className="field" style={{ margin: 0 }}>
                <span className="tiny-label">Revision mode</span>
                <select
                  className="select-input"
                  value={revisionMode}
                  onChange={(e) => setRevisionMode(e.target.value as RevisionMode)}
                >
                  <option value="manual">Manual edit</option>
                  <option value="suggested">Suggested criteria</option>
                </select>
              </label>

              {revisionMode === 'suggested' ? (
                <label className="field" style={{ margin: 0 }}>
                  <span className="tiny-label">Suggested focus</span>
                  <select
                    className="select-input"
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                  >
                    {revisionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div />
              )}
            </div>

            {revisionMode === 'manual' ? (
              <p className="section-note" style={{ marginTop: '10px' }}>
                Manual edit enabled — update the rubric in the text box above, then click Done.
              </p>
            ) : (
              <label className="field" style={{ marginTop: '10px' }}>
                <span className="tiny-label">Optional reviewer comment</span>
                <textarea
                  className="editor-textarea"
                  style={{ minHeight: '74px' }}
                  value={reviewerComment}
                  onChange={(e) => setReviewerComment(e.target.value)}
                  placeholder="Example: Add stronger partial-credit guidance and list expected key points."
                />
              </label>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
              {revisionMode === 'suggested' && (
                <button
                  className="primary-btn"
                  style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }}
                  onClick={() => handleGenerateSuggestedRevision(id, questionText, maxScore)}
                  disabled={revisingId === id}
                >
                  {revisingId === id ? 'Revising…' : 'Generate'}
                </button>
              )}
              <button
                className="ghost-btn"
                style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }}
                onClick={() => handleCloseRevision(id)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </td>
    )
  }

  const renderActionCell = (id: string) => {
    if (globalStatus === 'draft') {
      return (
        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
          <span className="status-pill status-pill--neutral" style={{ opacity: 0.5 }}>
            Pending
          </span>
        </td>
      )
    }

    const status = rowStatuses[id] || 'draft'
    const isApproved = status === 'approved'
    const isRevised = status === 'revised'

    return (
      <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          {isApproved ? (
            <span className="status-pill status-pill--success" style={{ width: '100%' }}>
              Accepted
            </span>
          ) : isRevised ? (
            <span className="status-pill status-pill--info" style={{ width: '100%' }}>
              Revised
            </span>
          ) : (
            <span className="status-pill status-pill--neutral" style={{ width: '100%' }}>
              Draft
            </span>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
            <button
              className="row-action-btn"
              style={{ width: '100%', justifyContent: 'center', opacity: isApproved ? 0.6 : 1 }}
              onClick={() => handleAcceptRow(id)}
              disabled={isApproved}
            >
              Accept
            </button>
            <button
              className="row-action-btn"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleOpenRevision(id)}
            >
              Revise
            </button>
          </div>
        </div>
      </td>
    )
  }

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Question Upload</p>
          <h1>Question upload & rubric generate</h1>
          <p className="subtle">
            Upload training questions, generate rubrics, and then run grading or calibration.
          </p>
        </div>

        <span
          className={
            isValid
              ? 'status-pill status-pill--success'
              : 'status-pill status-pill--warning'
          }
        >
          {isValid ? `${questions.length} questions detected` : 'Template required'}
        </span>
      </section>

      <section className="panel intake-console">
        <div className="intake-upload-row">
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
          <span>question_id, question, max_score</span>
        </div>

        <textarea
          className="editor-textarea code-textarea intake-textarea"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Question Preview</h3>
            <span className="tiny-label">Structured output</span>
          </div>

          {isValid && globalStatus === 'draft' && (
            <button
              type="button"
              className="primary-btn"
              onClick={handleGenerateAllRubrics}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating…' : 'Generate All Rubrics'}
            </button>
          )}
        </div>

        <div className="table-wrap">
          <table className="clean-table clean-table--compact">
            <thead>
              <tr>
                <th className="center-col">Index</th>
                <th>Question ID</th>
                <th>Question</th>
                <th>Max Score</th>
              </tr>
            </thead>

            <tbody>
              {questions.length > 0 ? (
                questions.map((q, index) => (
                  <tr key={q.question_id}>
                    <td className="center-col">{index + 1}</td>
                    <td className="mono-cell">{q.question_id}</td>
                    <td>{q.question}</td>
                    <td>{q.max_score}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="center-col" colSpan={4}>
                    No valid questions detected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel rubric-builder" style={{ marginTop: '18px' }} ref={rubricPanelRef}>
        <div className="panel-head">
          <div>
            <h3>Rubric Review</h3>
            <span className="tiny-label">Create → revise → approve</span>
          </div>

          <div className="action-stack">
            {globalStatus === 'generated' && !isGenerating && (
              <Link to="/grading" className="primary-btn">
                Continue to Submission Grading
              </Link>
            )}
          </div>
        </div>

        {(isGenerating || justGenerated || generationError) && (
          <div
            style={{
              margin: '8px 0 14px',
              padding: '14px 16px',
              background: 'var(--info-bg, #eef4ff)',
              border: '1px solid var(--brand-200, #c7d7ff)',
              borderRadius: '12px',
            }}
          >
            {isGenerating ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <strong style={{ fontSize: '0.95rem' }}>Generating rubrics…</strong>
                  <span className="tiny-label">
                    {progressDone} of {progressTotal}
                  </span>
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
              </>
            ) : justGenerated ? (
              <strong style={{ fontSize: '0.95rem', color: 'var(--brand-700, #1f3fae)' }}>
                ✓ Rubric is ready
              </strong>
            ) : (
              <div className="tiny-label" style={{ color: '#b3261e' }}>
                {generationError}
              </div>
            )}
          </div>
        )}

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr>
                <th className="center-col" style={{ width: '60px' }}>
                  Index
                </th>
                <th style={{ width: '120px' }}>Q. ID</th>
                <th style={{ width: '30%' }}>Question</th>
                <th style={{ width: '45%' }}>Scoring Rubric</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Status / Action</th>
              </tr>
            </thead>

            <tbody>
              {questions.length > 0 ? (
                questions.map((q: any, index: number) => {
                  const isApproved = rowStatuses[q.question_id] === 'approved'
                  return (
                    <Fragment key={q.question_id}>
                      <tr
                        style={{
                          backgroundColor: isApproved ? 'rgba(31, 153, 91, 0.05)' : '',
                          transition: 'background-color 0.3s ease',
                        }}
                      >
                        <td className="center-col">{index + 1}</td>
                        <td className="mono-cell">{q.question_id}</td>
                        <td>{q.question}</td>
                        {renderRubricCell(q.question_id, q.question, Number(q.max_score ?? 10))}
                        {renderActionCell(q.question_id)}
                      </tr>
                    </Fragment>
                  )
                })
              ) : (
                <tr>
                  <td className="center-col" colSpan={5}>
                    No questions available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
