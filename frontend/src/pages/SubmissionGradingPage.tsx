import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { gradeBatch } from '../lib/api'

type MissingRubricInfo = {
  missingQuestionIds: string[]
  affectedSubmissions: number
  anyRubricSaved: boolean
  enriched: any[]
}

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

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export default function SubmissionGradingPage() {
  const [jsonInput, setJsonInput] = useState<string>(() => {
    const saved = window.localStorage.getItem('grading_json_input')
    return saved && saved.trim() ? saved : sampleJsonInput
  })
  const [fileName, setFileName] = useState(() => window.localStorage.getItem('grading_file_name') || '')
  const [data, setData] = useState<any>(() => readLocal<any>('grading_results', null))
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>(
    () => readLocal<Record<string, Decision>>('grading_decisions', {}),
  )
  const [editedReasoning, setEditedReasoning] = useState<Record<string, string>>(
    () => readLocal<Record<string, string>>('grading_edited_reasoning', {}),
  )
  const [editedScores, setEditedScores] = useState<Record<string, number>>(
    () => readLocal<Record<string, number>>('grading_edited_scores', {}),
  )
  const [smoothProgress, setSmoothProgress] = useState(0)
  const [missingRubricInfo, setMissingRubricInfo] = useState<MissingRubricInfo | null>(null)
  const [inputView, setInputView] = useState<'table' | 'json'>('table')
  const [submissionsForResults, setSubmissionsForResults] = useState<any[]>(
    () => readLocal<any[]>('grading_submissions', []),
  )
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const [selectedDistQid, setSelectedDistQid] = useState<string>('')
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

  // Persist everything so navigating to another page and back does not lose state.
  // Restart button on the Home page is the official way to wipe this.
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

  useEffect(() => {
    window.localStorage.setItem('grading_json_input', jsonInput)
  }, [jsonInput])

  useEffect(() => {
    window.localStorage.setItem('grading_file_name', fileName)
  }, [fileName])

  useEffect(() => {
    if (submissionsForResults.length > 0) {
      window.localStorage.setItem('grading_submissions', JSON.stringify(submissionsForResults))
    }
  }, [submissionsForResults])

  // Close the export dropdown when clicking outside it.
  useEffect(() => {
    if (!exportMenuOpen) return
    function onClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [exportMenuOpen])

  useEffect(() => {
    if (window.localStorage.getItem('grading_demo_prefill') === '1') {
      const payload = window.localStorage.getItem('grading_demo_submissions') || ''
      if (payload) setJsonInput(payload)
      window.localStorage.removeItem('grading_demo_prefill')
      window.localStorage.removeItem('grading_demo_submissions')
    }
  }, [])

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

  // Per-question stats for the box plot. Groups gradable results by question_id
  // and computes min / Q1 / median / Q3 / max / mean / count / max_score.
  const perQuestionStats = useMemo(() => {
    const byQid = new Map<string, { rowKey: string; score: number; maxScore: number }[]>()
    results.forEach((r: any, index: number) => {
      if (r.review_reason === 'no_rubric') return
      const rowKey = getRowKey(r, index)
      const score = Number(editedScores[rowKey] ?? r.score ?? 0)
      const maxScore = Number(r.max_score ?? 10)
      const qid = String(r.question_id ?? '—')
      if (!byQid.has(qid)) byQid.set(qid, [])
      byQid.get(qid)!.push({ rowKey, score, maxScore })
    })

    function quantile(sorted: number[], q: number): number {
      if (sorted.length === 0) return 0
      if (sorted.length === 1) return sorted[0]
      const pos = (sorted.length - 1) * q
      const lo = Math.floor(pos)
      const hi = Math.ceil(pos)
      if (lo === hi) return sorted[lo]
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
    }

    return Array.from(byQid.entries()).map(([qid, rows]) => {
      const scores = rows.map((r) => r.score).sort((a, b) => a - b)
      const maxScore = Math.max(...rows.map((r) => r.maxScore), 0) || 10
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length
      return {
        qid,
        n: scores.length,
        maxScore,
        min: scores[0],
        max: scores[scores.length - 1],
        mean,
        q1: quantile(scores, 0.25),
        median: quantile(scores, 0.5),
        q3: quantile(scores, 0.75),
      }
    })
  }, [results, editedScores])

  // Default the dropdown to the first question once stats are available.
  useEffect(() => {
    if (perQuestionStats.length === 0) return
    if (!selectedDistQid || !perQuestionStats.find((s) => s.qid === selectedDistQid)) {
      setSelectedDistQid(perQuestionStats[0].qid)
    }
  }, [perQuestionStats, selectedDistQid])

  // Per-student totals (sum of scores across questions, ignoring no_rubric rows).
  const studentTotals = useMemo(() => {
    const byStudent = new Map<string, { total: number; max: number; n: number }>()
    results.forEach((r: any, index: number) => {
      if (r.review_reason === 'no_rubric') return
      const sid = String(r.student_id ?? '')
      if (!sid) return
      const rowKey = getRowKey(r, index)
      const score = Number(editedScores[rowKey] ?? r.score ?? 0)
      const maxScore = Number(r.max_score ?? 10)
      const cur = byStudent.get(sid) || { total: 0, max: 0, n: 0 }
      cur.total += score
      cur.max += maxScore
      cur.n += 1
      byStudent.set(sid, cur)
    })

    return Array.from(byStudent.entries())
      .map(([student_id, v]) => ({
        student_id,
        total: Math.round(v.total * 100) / 100,
        max: Math.round(v.max * 100) / 100,
        n: v.n,
        pct: v.max > 0 ? (v.total / v.max) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [results, editedScores])

  function handleApproveAll() {
    const next: Record<string, Decision> = { ...decisions }
    results.forEach((item: any, index: number) => {
      const key = getRowKey(item, index)
      if ((next[key] || 'pending') !== 'rejected') next[key] = 'approved'
    })
    setDecisions(next)
  }

  const answerByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of submissionsForResults) {
      const sid = String(row?.student_id ?? '')
      const qid = String(row?.question_id ?? '')
      const answer = String(row?.answer ?? '')
      if (sid) map.set(`${sid}|${qid}`, answer)
    }
    return map
  }, [submissionsForResults])

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

  function buildEnrichedSubmissions(rawSubmissions: any[]) {
    const savedQuestions = loadSavedQuestions()
    const rawRubrics = loadSavedRubrics()

    const normalizeId = (v: any) => String(v || '').trim().toLowerCase()

    const questionByNormId = new Map<string, any>()
    for (const q of savedQuestions) {
      const id = normalizeId(q?.question_id)
      if (id) questionByNormId.set(id, q)
    }

    const rubricByNormId = new Map<string, string>()
    for (const [k, v] of Object.entries(rawRubrics)) {
      const id = normalizeId(k)
      if (id && typeof v === 'string' && v.trim()) {
        rubricByNormId.set(id, v)
      }
    }

    // Auto-bind: if there is exactly one question with a non-empty rubric,
    // submissions missing question_id can fall back to it.
    const questionsWithRubric = Array.from(rubricByNormId.keys())
      .map((id) => ({ id, q: questionByNormId.get(id) }))
      .filter((x) => x.q)
    const singleAutoBind = questionsWithRubric.length === 1 ? questionsWithRubric[0] : null

    const enriched = rawSubmissions.map((row: any) => {
      const rawRowId = String(row.question_id || '').trim()
      let normId = normalizeId(rawRowId)

      if (!normId && singleAutoBind) {
        normId = singleAutoBind.id
      }

      const q: any = normId ? questionByNormId.get(normId) : undefined
      const rubricText = normId ? (rubricByNormId.get(normId) || '') : ''

      // Display id: prefer the saved question's exact-case id, then the
      // submission's own id, then the auto-bound id.
      const displayId = String(q?.question_id || rawRowId || normId || '')

      const questionText =
        String(q?.question_text || q?.question || q?.text || '').trim() ||
        (displayId ? `Question ${displayId}` : 'Question')
      const maxScore = Number(q?.max_score ?? 10)
      const benchmarkType = q?.benchmark_type ? String(q.benchmark_type) : undefined

      return {
        ...row,
        question_id: displayId,
        question_text: questionText,
        rubric: rubricText || undefined,
        max_score: Number.isFinite(maxScore) ? maxScore : 10,
        benchmark_type: benchmarkType,
      }
    })

    const anyRubricSaved = rubricByNormId.size > 0
    const missingRows = enriched.filter((r: any) => !r.rubric)
    const missingQuestionIds = Array.from(
      new Set(missingRows.map((r: any) => String(r.question_id || '').trim() || '(no id)')),
    )

    return {
      enriched,
      missingRows,
      missingQuestionIds,
      anyRubricSaved,
    }
  }

  async function runGradeBatch(enriched: any[]) {
    setLoading(true)
    setSmoothProgress(0)
    gradingStartRef.current = Date.now()
    gradingTotalRef.current = enriched.length

    try {
      const result = await gradeBatch(enriched)

      setData(result)
      setSubmissionsForResults(enriched)
      setDecisions({})
      setSmoothProgress(100)

      // Persist the enriched submissions so the Evaluation page can use them
      // for calibration (calibration needs the answer text to re-grade rounds 2+).
      try {
        window.localStorage.setItem('grading_submissions', JSON.stringify(enriched))
      } catch {
        // ignore quota errors
      }
    } catch (error: any) {
      alert(error?.message || 'Invalid file format or backend error.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRun() {
    if (!submissions.length) {
      alert('No valid submissions detected. Please upload a JSON file with student_id and answer.')
      return
    }

    // Clear the UI back to "ready" before starting a new run so the table
    // empties immediately and the user sees fresh state, not stale results.
    setData(null)
    setSubmissionsForResults([])
    setDecisions({})
    setEditedReasoning({})
    setEditedScores({})
    setExpandedId(null)
    setMissingRubricInfo(null)

    const { enriched, missingRows, missingQuestionIds, anyRubricSaved } =
      buildEnrichedSubmissions(submissions)

    if (missingRows.length > 0) {
      setMissingRubricInfo({
        missingQuestionIds,
        affectedSubmissions: missingRows.length,
        anyRubricSaved,
        enriched,
      })
      return
    }

    await runGradeBatch(enriched)
  }

  async function handleGradeAnyway() {
    const info = missingRubricInfo
    if (!info) return
    setMissingRubricInfo(null)
    await runGradeBatch(info.enriched)
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
    const rows = results.map((r: any, index: number) => {
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

    const payload = {
      results: rows,
      student_totals: studentTotals.map((s) => ({
        student_id: s.student_id,
        total_score: s.total,
        max_score: s.max,
        questions_graded: s.n,
        percentage: Math.round(s.pct * 100) / 100,
      })),
    }

    downloadFile(
      'grading_report.json',
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  function exportCsv() {
    const headers = ['#', 'Student ID', 'Question ID', 'Score', 'Max Score', 'Status', 'Decision', 'Reasoning']

    const escape = (val: unknown) => {
      const s = String(val ?? '')
      // RFC 4180: quote if it contains comma, quote, newline, or carriage return.
      if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }

    const rows = results.map((r: any, index: number) => {
      const rowKey = getRowKey(r, index)
      const noRubric = r.review_reason === 'no_rubric'
      const maxScore = r.max_score ?? 10
      const score = noRubric ? '' : (editedScores[rowKey] ?? r.score)
      const reasoning = editedReasoning[rowKey] ?? r.reasoning ?? ''
      return [
        index + 1,
        r.student_id ?? '',
        r.question_id ?? '',
        score,
        noRubric ? '' : maxScore,
        r.review_required ? 'Needs Review' : 'Ready',
        decisions[rowKey] || 'pending',
        reasoning,
      ].map(escape).join(',')
    })

    const totalHeaders = ['Rank', 'Student ID', 'Questions', 'Total Score', 'Max Score', 'Percentage']
    const totalRows = studentTotals.map((s, i) =>
      [i + 1, s.student_id, s.n, s.total, s.max, s.pct.toFixed(2) + '%']
        .map(escape)
        .join(','),
    )

    const csv = [
      headers.map(escape).join(','),
      ...rows,
      '',
      'Student Totals',
      totalHeaders.map(escape).join(','),
      ...totalRows,
    ].join('\r\n')
    // Prepend BOM so Excel detects UTF-8 correctly.
    downloadFile('grading_report.csv', '﻿' + csv, 'text/csv;charset=utf-8')
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

    if (studentTotals.length > 0) {
      doc.addPage()
      doc.setFontSize(16)
      doc.setTextColor(16, 34, 70)
      doc.text('Student Totals', 40, 40)
      doc.setFontSize(10)
      doc.setTextColor(80)
      doc.text('Total score across all graded questions, sorted high to low.', 40, 58)

      autoTable(doc, {
        startY: 76,
        head: [['Rank', 'Student ID', 'Questions', 'Total', 'Max', 'Percentage']],
        body: studentTotals.map((s, i) => [
          String(i + 1),
          String(s.student_id),
          String(s.n),
          String(s.total),
          String(s.max),
          `${s.pct.toFixed(1)}%`,
        ]),
        styles: { fontSize: 10, cellPadding: 6, valign: 'middle' },
        headStyles: { fillColor: [243, 246, 255], textColor: [16, 34, 70], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 50, halign: 'center' },
          1: { cellWidth: 160 },
          2: { cellWidth: 80, halign: 'center' },
          3: { cellWidth: 70, halign: 'center' },
          4: { cellWidth: 70, halign: 'center' },
          5: { cellWidth: 90, halign: 'center' },
        },
        margin: { left: 40, right: 40 },
      })
    }

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

      {missingRubricInfo && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setMissingRubricInfo(null)}
        >
          <div
            className="panel"
            style={{
              maxWidth: 520,
              width: '100%',
              padding: 24,
              background: 'white',
              borderRadius: 12,
              boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Missing rubric{missingRubricInfo.missingQuestionIds.length > 1 ? 's' : ''}</h3>
            <p className="subtle" style={{ marginTop: 0 }}>
              {missingRubricInfo.anyRubricSaved
                ? `No saved rubric matches ${missingRubricInfo.missingQuestionIds.length > 1 ? 'these question ids' : 'this question id'}. Check that the question_id in your submissions matches the one on the Questions & Rubrics page.`
                : `You haven't generated any rubrics yet. Generate them first so the grader knows how to score each answer.`}
            </p>
            <ul style={{ marginTop: 8, marginBottom: 16, paddingLeft: 20 }}>
              {missingRubricInfo.missingQuestionIds.map((id) => (
                <li key={id}><code>{id}</code></li>
              ))}
            </ul>
            <p className="tiny-label" style={{ marginBottom: 16 }}>
              {missingRubricInfo.affectedSubmissions} submission{missingRubricInfo.affectedSubmissions === 1 ? '' : 's'} affected.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="ghost-btn" onClick={() => setMissingRubricInfo(null)}>
                Cancel
              </button>
              <button type="button" className="ghost-btn" onClick={handleGradeAnyway}>
                Grade anyway
              </button>
              <Link to="/intake" className="primary-btn" style={{ textDecoration: 'none' }}>
                Generate / check rubrics
              </Link>
            </div>
          </div>
        </div>
      )}

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

          <div className="upload-actions" style={{ alignItems: 'center', gap: 8 }}>
            <div role="tablist" aria-label="Submissions view" style={{ display: 'inline-flex', border: '1px solid #d6dbe6', borderRadius: 8, overflow: 'hidden' }}>
              <button
                type="button"
                role="tab"
                aria-selected={inputView === 'table'}
                onClick={() => setInputView('table')}
                className={inputView === 'table' ? 'primary-btn' : 'ghost-btn'}
                style={{ borderRadius: 0, padding: '4px 12px', fontSize: '0.85rem' }}
              >
                Table
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputView === 'json'}
                onClick={() => setInputView('json')}
                className={inputView === 'json' ? 'primary-btn' : 'ghost-btn'}
                style={{ borderRadius: 0, padding: '4px 12px', fontSize: '0.85rem' }}
              >
                JSON
              </button>
            </div>

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

        {inputView === 'table' ? (
          submissions.length > 0 ? (
            <div className="table-wrap">
              <table className="clean-table clean-table--compact">
                <thead>
                  <tr>
                    <th className="center-col" style={{ width: 48 }}>#</th>
                    <th style={{ width: 120 }}>Student ID</th>
                    <th style={{ width: 100 }}>Question ID</th>
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((row: any, idx: number) => {
                    const answer = String(row.answer || '')
                    const truncated = answer.length > 160 ? answer.slice(0, 157) + '…' : answer
                    return (
                      <tr key={`${row.student_id}-${row.question_id || idx}`}>
                        <td className="center-col">{idx + 1}</td>
                        <td className="mono-cell">{row.student_id}</td>
                        <td className="mono-cell">{row.question_id || '—'}</td>
                        <td title={answer} style={{ whiteSpace: 'pre-wrap' }}>{truncated}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="section-note" style={{ marginTop: 12 }}>
              No valid submissions parsed yet — switch to <strong>JSON</strong> view to paste or edit input.
            </p>
          )
        ) : (
          <textarea
            className="editor-textarea code-textarea input-textarea"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
        )}
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
              <div>
                <h3>Grade Distribution</h3>
                <span className="tiny-label">Box plot per question (min · Q1 · median · Q3 · max, with mean marker)</span>
              </div>

              <div className="export-actions">
                <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    onClick={() => setExportMenuOpen((v) => !v)}
                  >
                    Export ▾
                  </button>
                  {exportMenuOpen && (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: 0,
                        minWidth: 160,
                        background: 'white',
                        border: '1px solid #d6dbe6',
                        borderRadius: 8,
                        boxShadow: '0 12px 24px rgba(15,23,42,0.12)',
                        zIndex: 20,
                        padding: 4,
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="ghost-btn"
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 6 }}
                        onClick={() => { setExportMenuOpen(false); exportJson() }}
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="ghost-btn"
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 6 }}
                        onClick={() => { setExportMenuOpen(false); exportCsv() }}
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="ghost-btn"
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 6 }}
                        onClick={() => { setExportMenuOpen(false); exportPdf() }}
                      >
                        Export PDF
                      </button>
                    </div>
                  )}
                </div>
                <Link to="/evaluation" className="primary-btn">
                  Continue to Evaluation
                </Link>
              </div>
            </div>

            {perQuestionStats.length === 0 ? (
              <p className="section-note" style={{ marginTop: 12 }}>
                No gradable rows yet — the box plot will appear once submissions are graded.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 16 }}>
                  <label htmlFor="dist-qid" className="tiny-label" style={{ margin: 0 }}>Question</label>
                  <select
                    id="dist-qid"
                    value={selectedDistQid}
                    onChange={(e) => setSelectedDistQid(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d6dbe6', fontSize: '0.9rem' }}
                  >
                    {perQuestionStats.map((s) => (
                      <option key={s.qid} value={s.qid}>
                        {s.qid} (n={s.n}, max {s.maxScore})
                      </option>
                    ))}
                  </select>
                </div>

                {(() => {
                  const s = perQuestionStats.find((x) => x.qid === selectedDistQid) || perQuestionStats[0]
                  if (!s) return null
                  const W = 720
                  const H = 180
                  const PAD_L = 40
                  const PAD_R = 30
                  const innerW = W - PAD_L - PAD_R
                  const axisY = 130
                  const boxTop = 70
                  const boxBottom = 110
                  const xFor = (v: number) => PAD_L + (Math.max(0, Math.min(v, s.maxScore)) / Math.max(s.maxScore, 1e-9)) * innerW
                  const tickCount = 6
                  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (s.maxScore * i) / tickCount)

                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }} aria-label={`Box plot for ${s.qid}`}>
                        {/* axis */}
                        <line x1={PAD_L} y1={axisY} x2={W - PAD_R} y2={axisY} stroke="#cbd5e1" />
                        {ticks.map((t, i) => (
                          <g key={i}>
                            <line x1={xFor(t)} y1={axisY} x2={xFor(t)} y2={axisY + 5} stroke="#94a3b8" />
                            <text x={xFor(t)} y={axisY + 18} fontSize="10" textAnchor="middle" fill="#475569">
                              {Number.isInteger(t) ? t : t.toFixed(1)}
                            </text>
                          </g>
                        ))}
                        <text x={W / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="#475569">
                          Score (0 – {s.maxScore})
                        </text>

                        {/* whiskers */}
                        <line x1={xFor(s.min)} y1={(boxTop + boxBottom) / 2} x2={xFor(s.q1)} y2={(boxTop + boxBottom) / 2} stroke="#3a6dff" strokeWidth={2} />
                        <line x1={xFor(s.q3)} y1={(boxTop + boxBottom) / 2} x2={xFor(s.max)} y2={(boxTop + boxBottom) / 2} stroke="#3a6dff" strokeWidth={2} />
                        {/* whisker caps */}
                        <line x1={xFor(s.min)} y1={boxTop + 8} x2={xFor(s.min)} y2={boxBottom - 8} stroke="#3a6dff" strokeWidth={2} />
                        <line x1={xFor(s.max)} y1={boxTop + 8} x2={xFor(s.max)} y2={boxBottom - 8} stroke="#3a6dff" strokeWidth={2} />
                        {/* box */}
                        <rect
                          x={xFor(s.q1)}
                          y={boxTop}
                          width={Math.max(1, xFor(s.q3) - xFor(s.q1))}
                          height={boxBottom - boxTop}
                          fill="#c7d7ff"
                          stroke="#3a6dff"
                          strokeWidth={2}
                        />
                        {/* median */}
                        <line x1={xFor(s.median)} y1={boxTop} x2={xFor(s.median)} y2={boxBottom} stroke="#102246" strokeWidth={2} />
                        {/* mean */}
                        <circle cx={xFor(s.mean)} cy={(boxTop + boxBottom) / 2} r={5} fill="#f5b301" stroke="#102246" strokeWidth={1.5} />

                        {/* labels above */}
                        <text x={xFor(s.min)} y={boxTop - 8} fontSize="10" textAnchor="middle" fill="#475569">min {s.min}</text>
                        <text x={xFor(s.max)} y={boxTop - 8} fontSize="10" textAnchor="middle" fill="#475569">max {s.max}</text>
                        <text x={xFor(s.mean)} y={boxBottom + 18} fontSize="10" textAnchor="middle" fill="#102246">
                          mean {s.mean.toFixed(1)}
                        </text>
                      </svg>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, fontSize: '0.85rem', color: '#475569' }}>
                        <span><strong>n</strong>: {s.n}</span>
                        <span><strong>Min</strong>: {s.min}</span>
                        <span><strong>Q1</strong>: {s.q1.toFixed(1)}</span>
                        <span><strong>Median</strong>: {s.median.toFixed(1)}</span>
                        <span><strong>Q3</strong>: {s.q3.toFixed(1)}</span>
                        <span><strong>Max</strong>: {s.max}</span>
                        <span><strong>Mean</strong>: {s.mean.toFixed(2)}</span>
                        <span><strong>Out of</strong>: {s.maxScore}</span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>All Results</h3>
                <span className="tiny-label">Interactive review table</span>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={handleApproveAll}
                disabled={results.length === 0}
                title="Set every pending row to approved (rejected rows are left as-is)"
              >
                Approve all
              </button>
            </div>

            <div className="table-wrap">
              <table className="clean-table clean-table--compact results-table">
                <thead>
                  <tr>
                    <th className="center-col" style={{ width: 56 }}>Index</th>
                    <th style={{ width: 110 }}>Student ID</th>
                    <th style={{ width: 90 }}>Question ID</th>
                    <th style={{ width: 220 }}>Answer</th>
                    <th style={{ width: 80 }}>Score</th>
                    <th style={{ width: 90 }}>Status</th>
                    <th>Reasoning</th>
                    <th className="action-col" style={{ width: 120 }}>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((item: any, index: number) => {
                    const rowKey = getRowKey(item, index)
                    const decision = decisions[rowKey] || 'pending'
                    const isExpanded = expandedId === rowKey
                    const fullAnswer = answerByKey.get(`${item.student_id ?? ''}|${item.question_id ?? ''}`) || ''
                    const answerPreview = fullAnswer.length > 80 ? fullAnswer.slice(0, 77) + '…' : fullAnswer

                    return (
                      <tr key={rowKey} className={item.review_required ? 'warn-row' : ''}>
                        <td className="center-col">{index + 1}</td>
                        <td className="mono-cell">{item.student_id}</td>
                        <td className="mono-cell">{item.question_id || '—'}</td>
                        <td title={fullAnswer} style={{ maxWidth: 240, whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: 'var(--ink-700, #444)' }}>
                          {answerPreview || <span className="subtle">—</span>}
                        </td>
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

                          {isExpanded && fullAnswer && (
                            <div style={{ marginTop: 8 }}>
                              <p className="tiny-label" style={{ marginBottom: 4 }}>Student answer</p>
                              <p className="reasoning-detail" style={{ whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.03)', padding: 8, borderRadius: 6 }}>
                                {fullAnswer}
                              </p>
                              <p className="tiny-label" style={{ marginTop: 8, marginBottom: 4 }}>AI reasoning</p>
                            </div>
                          )}

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

          {studentTotals.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Student Totals</h3>
                  <span className="tiny-label">Total score across all graded questions, sorted high to low</span>
                </div>
                <span className="tiny-label">{studentTotals.length} student{studentTotals.length === 1 ? '' : 's'}</span>
              </div>

              <div className="table-wrap">
                <table className="clean-table clean-table--compact">
                  <thead>
                    <tr>
                      <th className="center-col" style={{ width: 56 }}>Rank</th>
                      <th style={{ width: 140 }}>Student ID</th>
                      <th className="center-col" style={{ width: 80 }}>Questions</th>
                      <th style={{ width: 160 }}>Total / Max</th>
                      <th style={{ width: 90 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentTotals.map((row, idx) => (
                      <tr key={row.student_id}>
                        <td className="center-col">{idx + 1}</td>
                        <td className="mono-cell">{row.student_id}</td>
                        <td className="center-col">{row.n}</td>
                        <td><strong>{row.total}</strong> / {row.max}</td>
                        <td><strong>{row.pct.toFixed(1)}%</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}