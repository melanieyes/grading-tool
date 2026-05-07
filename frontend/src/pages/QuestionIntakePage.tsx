import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

type IntakeMode = 'csv' | 'json'

const csvTemplate = `question_id,question,max_score
q1,"Explain why deadlock happens and how resource ordering prevents it.",10
q2,"Compare paging and segmentation in memory management.",10`

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

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map((h) => h.trim())

  return lines
    .slice(1)
    .map((line) => {
      const values = splitCsvLine(line)
      const row: Record<string, string> = {}

      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      return {
        question_id: row.question_id || row.id || '',
        question: row.question || row.question_text || row.prompt || '',
        max_score: Number(row.max_score || row.points || 10),
        benchmark_type: row.benchmark_type || '',
      }
    })
    .filter((q) => q.question_id && q.question)
}

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

function parseJson(text: string) {
  try {
    const parsed = JSON.parse(text)
    return flattenJsonQuestions(parsed).filter((q) => q.question_id && q.question)
  } catch {
    return []
  }
}

export default function QuestionIntakePage() {
  const [mode, setMode] = useState<IntakeMode>('csv')
  const [csvInput, setCsvInput] = useState(csvTemplate)
  const [jsonInput, setJsonInput] = useState(jsonTemplate)
  const [fileName, setFileName] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const questions = useMemo(() => {
    return mode === 'csv' ? parseCsv(csvInput) : parseJson(jsonInput)
  }, [mode, csvInput, jsonInput])

  useEffect(() => {
    if (questions.length > 0) {
      localStorage.setItem('grading_questions', JSON.stringify(questions))
    }
  }, [questions])

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

      if (file.name.endsWith('.json')) {
        setMode('json')
        setJsonInput(text)
      } else {
        setMode('csv')
        setCsvInput(text)
      }
    }

    reader.readAsText(file)
  }

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Question Intake</p>
          <h1>Prepare grading questions</h1>
          <p className="subtle">
            Upload a structured CSV or JSON file, then preview the detected
            questions before rubric generation.
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
          <div className="mode-switch">
            <button
              type="button"
              className={`mode-btn ${mode === 'csv' ? 'active' : ''}`}
              onClick={() => setMode('csv')}
            >
              CSV Input
            </button>

            <button
              type="button"
              className={`mode-btn ${mode === 'json' ? 'active' : ''}`}
              onClick={() => setMode('json')}
            >
              JSON Input
            </button>
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

        <div className="template-card">
          <strong>Required fields</strong>
          <span>question_id, question, max_score</span>
        </div>

        <textarea
          className="editor-textarea code-textarea intake-textarea"
          value={mode === 'csv' ? csvInput : jsonInput}
          onChange={(e) =>
            mode === 'csv'
              ? setCsvInput(e.target.value)
              : setJsonInput(e.target.value)
          }
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Question Preview</h3>
            <span className="tiny-label">Structured output</span>
          </div>

          {isValid && (
            <Link to="/rubric" className="primary-btn">
              Continue to Rubric Review
            </Link>
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
    </main>
  )
}