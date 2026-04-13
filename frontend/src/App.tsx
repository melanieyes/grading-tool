import { useMemo, useState } from 'react'
import './App.css'

type IntakeMode = 'manual' | 'json'
type WorkflowStatus = 'idle' | 'rubric_draft' | 'rubric_approved' | 'rubric_declined' | 'graded'

type SubmissionAnswer = {
  questionId: string
  answer: string
}

type StudentSubmission = {
  studentId: string
  answers: SubmissionAnswer[]
}

type GradedQuestion = {
  questionId: string
  score: number
  maxScore: number
  notes: string
}

type StudentGrade = {
  studentId: string
  totalScore: number
  maxScore: number
  questions: GradedQuestion[]
}

const sampleQuestionText = `Q1. Explain the difference between process and thread in operating systems.
Q2. Given an SQL schema, write a query to return the top 3 students by GPA.
Q3. Analyze time complexity for the provided algorithm and justify your result.`

const sampleQuestionJson = `{
  "questions": [
    { "id": "q1", "text": "Explain the difference between process and thread in operating systems." },
    { "id": "q2", "text": "Write an SQL query to return the top 3 students by GPA." },
    { "id": "q3", "text": "Analyze the time complexity of the provided algorithm." }
  ]
}`

const sampleSubmissionJson = `{
  "submissions": [
    {
      "studentId": "student001",
      "answers": [
        { "questionId": "q1", "answer": "A process owns resources while a thread is a lightweight execution unit." },
        { "questionId": "q2", "answer": "SELECT student_id FROM grades ORDER BY gpa DESC LIMIT 3;" },
        { "questionId": "q3", "answer": "The algorithm runs in O(n log n) because it sorts once and scans once." }
      ]
    },
    {
      "studentId": "student002",
      "answers": [
        { "questionId": "q1", "answer": "Threads are smaller than processes." },
        { "questionId": "q2", "answer": "I would use a query with order by and limit." },
        { "questionId": "q3", "answer": "Looks linear." }
      ]
    }
  ]
}`

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').trim()
}

function parseQuestionsFromText(rawText: string): string[] {
  const trimmed = normalizeWhitespace(rawText)
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return parseQuestionsFromJson(parsed)
    } catch {
      return trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    }
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseQuestionsFromJson(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const candidate =
            record.text ??
            record.question ??
            record.prompt ??
            record.question_text ??
            record.questionText ??
            record.question_id ??
            record.questionId

          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim()
          }

          const subparts = record.subparts ?? record.parts ?? record.items
          if (Array.isArray(subparts)) {
            return parseQuestionsFromJson(subparts).join(' | ')
          }
        }
        return ''
      })
      .filter(Boolean)
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidate =
      record.questions ?? record.question_set ?? record.questionSet ?? record.items

    if (Array.isArray(candidate)) {
      const extracted = parseQuestionsFromJson(candidate)
      if (extracted.length > 0) {
        return extracted
      }

      const nested = candidate.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }

        const nestedRecord = item as Record<string, unknown>
        const questionText =
          typeof nestedRecord.question_text === 'string'
            ? nestedRecord.question_text.trim()
            : typeof nestedRecord.questionText === 'string'
              ? nestedRecord.questionText.trim()
              : typeof nestedRecord.text === 'string'
                ? nestedRecord.text.trim()
                : typeof nestedRecord.question === 'string'
                  ? nestedRecord.question.trim()
                  : ''

        const subparts = nestedRecord.subparts ?? nestedRecord.parts
        const subpartTexts = Array.isArray(subparts)
          ? parseQuestionsFromJson(subparts)
          : []

        const output: string[] = []
        if (questionText) {
          output.push(questionText)
        }
        output.push(...subpartTexts)
        return output
      })

      return nested.filter(Boolean)
    }

    if (typeof candidate === 'string') {
      return candidate
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    }
  }

  return []
}

function parseSubmissionsFromJson(payload: unknown): StudentSubmission[] {
  const candidate =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).submissions ??
        (payload as Record<string, unknown>).students ??
        payload
      : payload

  if (!Array.isArray(candidate)) {
    return []
  }

  return candidate
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const studentId =
        (typeof record.studentId === 'string' && record.studentId.trim()) ||
        (typeof record.student_id === 'string' && record.student_id.trim()) ||
        (typeof record.id === 'string' && record.id.trim()) ||
        `student-${index + 1}`

      const rawAnswers =
        record.answers ?? record.responses ?? record.submission ?? record.answerSet

      const answers: SubmissionAnswer[] = []

      if (Array.isArray(rawAnswers)) {
        for (const answer of rawAnswers) {
          if (!answer || typeof answer !== 'object') {
            continue
          }
          const answerRecord = answer as Record<string, unknown>
          const questionId =
            typeof answerRecord.questionId === 'string'
              ? answerRecord.questionId.trim()
              : typeof answerRecord.question_id === 'string'
                ? answerRecord.question_id.trim()
              : typeof answerRecord.question === 'string'
                ? answerRecord.question.trim()
                : `q${answers.length + 1}`
          const answerText =
            typeof answerRecord.answer === 'string'
              ? answerRecord.answer.trim()
              : typeof answerRecord.student_answer === 'string'
                ? answerRecord.student_answer.trim()
              : typeof answerRecord.text === 'string'
                ? answerRecord.text.trim()
                : ''
          if (answerText) {
            answers.push({ questionId, answer: answerText })
          }
        }
      }

      const fallbackAnswers =
        record.answers ?? record.responses ?? record.student_answers ?? record.studentAnswers

      if (answers.length === 0 && typeof fallbackAnswers === 'object' && fallbackAnswers) {
        for (const [questionId, answer] of Object.entries(fallbackAnswers as Record<string, unknown>)) {
          if (typeof answer === 'string' && answer.trim()) {
            answers.push({ questionId, answer: answer.trim() })
          } else if (answer && typeof answer === 'object') {
            const answerRecord = answer as Record<string, unknown>
            const text =
              typeof answerRecord.student_answer === 'string'
                ? answerRecord.student_answer.trim()
                : typeof answerRecord.answer === 'string'
                  ? answerRecord.answer.trim()
                  : typeof answerRecord.text === 'string'
                    ? answerRecord.text.trim()
                    : ''
            if (text) {
              answers.push({ questionId, answer: text })
            }
          }
        }
      }

      return { studentId, answers }
    })
    .filter((submission): submission is StudentSubmission => submission !== null)
}

function parseJsonFile<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function buildRubric(questions: string[]) {
  if (questions.length === 0) {
    return 'No questions found. Add a question set to generate a rubric.'
  }

  const rubricSections = questions
    .map((question, index) => {
      const questionId = `Q${index + 1}`
      return [
        `${questionId}: ${question}`,
        '- Criterion 1: Correct concept identification (0-4)',
        '- Criterion 2: Explanation quality and reasoning (0-3)',
        '- Criterion 3: Completeness and precision (0-3)',
        '- Expected key points: summarize core ideas, cite steps, and avoid unsupported claims.',
      ].join('\n')
    })
    .join('\n\n')

  return [
    'Rubric Draft',
    'Scale: 0-10 per question',
    '',
    rubricSections,
    '',
    'Global guidance:',
    '- Allow partial credit for correct intermediate steps.',
    '- Penalize major factual inaccuracies.',
    '- Keep scoring consistent across students.',
  ].join('\n')
}

function scoreAnswer(questionText: string, answerText: string, rubric: string) {
  const answer = answerText.trim()
  if (!answer) {
    return {
      score: 0,
      notes: 'No answer submitted.',
    }
  }

  const keywordHits = questionText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .filter((word) => answer.toLowerCase().includes(word)).length

  const lengthBonus = Math.min(3, Math.floor(answer.length / 45))
  const rubricBonus = Math.min(2, Math.floor(rubric.length / 700))
  const score = Math.min(10, 3 + keywordHits + lengthBonus + rubricBonus)

  return {
    score,
    notes:
      score >= 8
        ? 'Strong answer with relevant coverage.'
        : score >= 5
          ? 'Partial coverage; some important details are missing.'
          : 'Weak response; answer needs more precision and evidence.',
  }
}

function App() {
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('manual')
  const [questionText, setQuestionText] = useState(sampleQuestionText)
  const [questionJson, setQuestionJson] = useState(sampleQuestionJson)
  const [submissionJson, setSubmissionJson] = useState(sampleSubmissionJson)
  const [rubric, setRubric] = useState('')
  const [rubricStatus, setRubricStatus] = useState<WorkflowStatus>('idle')
  const [rubricMessage, setRubricMessage] = useState('Add a question set to start.')
  const [gradedStudents, setGradedStudents] = useState<StudentGrade[]>([])
  const [gradingMessage, setGradingMessage] = useState('Upload student submissions after approving the rubric.')
  const [questionFileName, setQuestionFileName] = useState('')
  const [submissionFileName, setSubmissionFileName] = useState('')

  const questions = useMemo(
    () => (intakeMode === 'json' ? parseQuestionsFromText(questionJson) : parseQuestionsFromText(questionText)),
    [intakeMode, questionJson, questionText],
  )

  const questionCount = questions.length
  const rubricLineCount = rubric.split('\n').filter(Boolean).length

  const handleQuestionFileUpload = async (file: File | null) => {
    if (!file) {
      return
    }

    const text = await file.text()
    const parsed = parseJsonFile<unknown>(text, null)
    const extractedQuestions = parseQuestionsFromJson(parsed)

    if (extractedQuestions.length > 0) {
      setIntakeMode('json')
      setQuestionJson(text)
      setQuestionFileName(file.name)
      setRubricMessage(`Loaded ${extractedQuestions.length} questions from ${file.name}.`)
      return
    }

    setQuestionJson(text)
    setQuestionFileName(file.name)
    setRubricMessage(`Loaded ${file.name}, but no questions were detected in the JSON.`)
  }

  const handleSubmissionFileUpload = async (file: File | null) => {
    if (!file) {
      return
    }

    const text = await file.text()
    setSubmissionJson(text)
    setSubmissionFileName(file.name)
    setGradingMessage(`Loaded ${file.name}. Ready to grade submissions.`)
  }

  const handleGenerateRubric = () => {
    const generated = buildRubric(questions)
    setRubric(generated)
    setRubricStatus('rubric_draft')
    setRubricMessage('Rubric draft generated. Review, edit, then approve or decline.')
    setGradedStudents([])
    setGradingMessage('Upload student submissions after approving the rubric.')
  }

  const handleApproveRubric = () => {
    if (!rubric.trim()) {
      setRubricMessage('Generate a rubric before approving it.')
      return
    }

    setRubricStatus('rubric_approved')
    setRubricMessage('Rubric approved. Student grading is now available.')
  }

  const handleDeclineRubric = () => {
    setRubricStatus('rubric_declined')
    setRubricMessage('Rubric declined. Edit the draft or regenerate from the question set.')
  }

  const handleReset = () => {
    setRubric('')
    setRubricStatus('idle')
    setRubricMessage('Add a question set to start.')
    setGradedStudents([])
    setGradingMessage('Upload student submissions after approving the rubric.')
  }

  const handleGradeSubmissions = () => {
    if (!rubric.trim()) {
      setGradingMessage('Generate and approve a rubric before grading submissions.')
      return
    }

    let parsedPayload: unknown = null
    try {
      parsedPayload = JSON.parse(submissionJson)
    } catch {
      setGradingMessage('Submission JSON could not be parsed.')
      return
    }

    const submissions = parseSubmissionsFromJson(parsedPayload)
    if (submissions.length === 0) {
      setGradingMessage('No student submissions were detected in the uploaded JSON.')
      return
    }

    const questionMap = new Map(
      questions.map((question, index) => [`q${index + 1}`, question]),
    )

    const results = submissions.map((submission) => {
      const perQuestion = submissions
        ? submission.answers.map((answer) => {
            const questionTextForScore =
              questionMap.get(answer.questionId) ?? questions[0] ?? answer.questionId
            const scoring = scoreAnswer(questionTextForScore, answer.answer, rubric)
            return {
              questionId: answer.questionId,
              score: scoring.score,
              maxScore: 10,
              notes: scoring.notes,
            }
          })
        : []

      const totalScore = perQuestion.reduce((sum, item) => sum + item.score, 0)
      const maxScore = perQuestion.length * 10

      return {
        studentId: submission.studentId,
        totalScore,
        maxScore,
        questions: perQuestion,
      }
    })

    setGradedStudents(results)
    setRubricStatus('graded')
    setGradingMessage(`Graded ${results.length} student submission set${results.length === 1 ? '' : 's'}.`)
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="nav-inner">
          <a className="brand" href="/">
            Grade Master
          </a>

          <nav className="main-nav" aria-label="Primary">
            <a href="#intake">Question Intake</a>
            <a href="#rubric">Rubric Review</a>
            <a href="#grading">Submission Grading</a>
          </nav>

          <button className="apply-btn" type="button">
            Full Workflow
          </button>
        </div>
      </header>

      <main className="page-content">
        <section className="hero-panel" id="intake">
          <p className="eyebrow">Grade Master</p>
          <h1>Upload questions, generate rubric, approve, then grade submissions.</h1>
          <p className="hero-copy">
            The site supports two question intake paths: paste questions manually or upload a JSON file.
            After rubric review, the professor can upload the student submission JSON set and generate grades.
          </p>

          <div className="kpi-grid compact">
            <article className="kpi-card">
              <h2>Questions Detected</h2>
              <p className="kpi-value">{questionCount}</p>
            </article>
            <article className="kpi-card">
              <h2>Rubric Lines</h2>
              <p className="kpi-value">{rubricLineCount}</p>
            </article>
          </div>
        </section>

        <section className="section-panel">
          <div className="section-head">
            <h2>1. Question Intake</h2>
            <p>Choose JSON upload or manual text entry.</p>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Question intake mode">
            <button
              type="button"
              className={intakeMode === 'manual' ? 'mode-btn active' : 'mode-btn'}
              onClick={() => setIntakeMode('manual')}
            >
              Manual Entry
            </button>
            <button
              type="button"
              className={intakeMode === 'json' ? 'mode-btn active' : 'mode-btn'}
              onClick={() => setIntakeMode('json')}
            >
              JSON Upload
            </button>
          </div>

          <div className="builder-grid">
            <div className="editor-block">
              <label htmlFor="question-file">Upload Question JSON</label>
              <input
                id="question-file"
                className="file-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => handleQuestionFileUpload(event.target.files?.[0] ?? null)}
              />
              <div className="file-hint">{questionFileName || 'No file uploaded.'}</div>
              <label htmlFor="question-text">Question Set</label>
              <textarea
                id="question-text"
                value={intakeMode === 'manual' ? questionText : questionJson}
                onChange={(event) => {
                  if (intakeMode === 'manual') {
                    setQuestionText(event.target.value)
                  } else {
                    setQuestionJson(event.target.value)
                  }
                }}
                placeholder="Enter one question per line or paste JSON"
              />
            </div>

            <div className="editor-block">
              <label htmlFor="question-preview">Detected Questions Preview</label>
              <textarea id="question-preview" readOnly value={questions.join('\n\n') || 'No questions detected yet.'} />
              <button type="button" className="primary-btn" onClick={handleGenerateRubric}>
                Generate Rubric
              </button>
              <div className="status-box" data-state={rubricStatus}>
                <p>{rubricMessage}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section-panel" id="rubric">
          <div className="section-head">
            <h2>2. Rubric Review</h2>
            <p>The rubric is editable before approval or decline.</p>
          </div>

          <div className="editor-block">
            <label htmlFor="rubric-editor">Generated Rubric</label>
            <textarea
              id="rubric-editor"
              value={rubric}
              onChange={(event) => setRubric(event.target.value)}
              placeholder="Generate a rubric from the question set"
            />
          </div>

          <div className="action-row">
            <button type="button" className="primary-btn" onClick={handleApproveRubric}>
              Approve Rubric
            </button>
            <button type="button" className="secondary-btn" onClick={handleDeclineRubric}>
              Decline Rubric
            </button>
            <button type="button" className="ghost-btn" onClick={handleReset}>
              Reset Draft
            </button>
          </div>
        </section>

        <section className="section-panel" id="grading">
          <div className="section-head">
            <h2>3. Student Submission Grading</h2>
            <p>Upload the full submission set in JSON and run grading after approval.</p>
          </div>

          <div className="builder-grid">
            <div className="editor-block">
              <label htmlFor="submission-file">Upload Student Submission JSON</label>
              <input
                id="submission-file"
                className="file-input"
                type="file"
                accept="application/json,.json"
                onChange={(event) => handleSubmissionFileUpload(event.target.files?.[0] ?? null)}
              />
              <div className="file-hint">{submissionFileName || 'No submission file uploaded.'}</div>
              <label htmlFor="submission-json">Submission JSON</label>
              <textarea
                id="submission-json"
                value={submissionJson}
                onChange={(event) => setSubmissionJson(event.target.value)}
                placeholder="Paste the student submission JSON"
              />
            </div>

            <div className="editor-block">
              <label>Grading Output</label>
              <div className="result-card">
                <p className="result-line">
                  Status: <strong>{rubricStatus.replace('_', ' ')}</strong>
                </p>
                <p className="result-line">{gradingMessage}</p>
                <button type="button" className="primary-btn" onClick={handleGradeSubmissions}>
                  Grade Submissions
                </button>
              </div>
              <div className="preview-block">
                <h3>Results Preview</h3>
                <pre>
                  {gradedStudents.length > 0
                    ? gradedStudents
                        .map(
                          (student) =>
                            `${student.studentId}: ${student.totalScore}/${student.maxScore}\n${student.questions
                              .map(
                                (question) =>
                                  `  ${question.questionId}: ${question.score}/${question.maxScore} - ${question.notes}`,
                              )
                              .join('\n')}`,
                        )
                        .join('\n\n')
                    : 'No graded submissions yet.'}
                </pre>
              </div>
            </div>
          </div>

          {gradedStudents.length > 0 ? (
            <div className="table-wrap grades-table">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Total Score</th>
                    <th>Max Score</th>
                    <th>Questions Graded</th>
                  </tr>
                </thead>
                <tbody>
                  {gradedStudents.map((student) => (
                    <tr key={student.studentId}>
                      <td>{student.studentId}</td>
                      <td>{student.totalScore}</td>
                      <td>{student.maxScore}</td>
                      <td>{student.questions.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>

      <footer className="footer">
        <p>
          Grade Master supports question intake, rubric generation, human review, and submission grading in one flow.
        </p>
      </footer>
    </div>
  )
}

export default App
