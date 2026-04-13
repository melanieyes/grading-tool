import { useMemo, useState } from 'react'
import { sampleQuestionJson, sampleQuestionText } from '../lib/demoData'
import { parseQuestionsFromText } from '../lib/gradingUtils'

type IntakeMode = 'manual' | 'json'

export default function QuestionIntakePage() {
  const [intakeMode, setIntakeMode] = useState<IntakeMode>('manual')
  const [questionText, setQuestionText] = useState(sampleQuestionText)
  const [questionJsonText, setQuestionJsonText] = useState(sampleQuestionJson)
  const [questionFileName, setQuestionFileName] = useState('')

  const questions = useMemo(() => {
    return intakeMode === 'manual'
      ? parseQuestionsFromText(questionText)
      : parseQuestionsFromText(questionJsonText)
  }, [intakeMode, questionText, questionJsonText])

  function handleQuestionFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setQuestionFileName(file.name)

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      setQuestionJsonText(text)
      setIntakeMode('json')
    }
    reader.readAsText(file)
  }

  return (
    <main className="shell intake-page">
      <section className="panel intake-hero">
        <div className="intake-hero-copy">
          <p className="eyebrow">Question Intake</p>
          <h1 className="intake-title">Add and preview question sets</h1>
          <p className="intake-copy">
            Start with manual text entry or upload a structured JSON file, then
            review the parsed questions before building the rubric.
          </p>
        </div>

        <div className="intake-hero-meta">
          <div className="hero-stat">
            <span>Input modes</span>
            <strong>Manual or JSON</strong>
          </div>
          <div className="hero-stat">
            <span>Preview</span>
            <strong>Parsed instantly</strong>
          </div>
        </div>
      </section>

      <section className="panel intake-builder">
        <div className="intake-toolbar">
          <div className="mode-switch" role="tablist" aria-label="Question intake mode">
            <button
              type="button"
              className={`mode-btn ${intakeMode === 'manual' ? 'active' : ''}`}
              onClick={() => setIntakeMode('manual')}
            >
              Manual Entry
            </button>
            <button
              type="button"
              className={`mode-btn ${intakeMode === 'json' ? 'active' : ''}`}
              onClick={() => setIntakeMode('json')}
            >
              JSON Upload
            </button>
          </div>

          <p className="intake-toolbar-note">
            {intakeMode === 'manual'
              ? 'Paste one or more questions in plain text.'
              : 'Upload a JSON file or edit the JSON directly below.'}
          </p>
        </div>

        <div className="intake-grid">
          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Source</p>
                <h2>{intakeMode === 'manual' ? 'Question Set' : 'Question JSON'}</h2>
              </div>
            </div>

            {intakeMode === 'manual' ? (
              <div className="editor-stack">
                <label htmlFor="question-manual" className="field-label">
                  Paste questions
                </label>
                <textarea
                  id="question-manual"
                  className="editor-textarea editor-textarea--lg"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                />
              </div>
            ) : (
              <div className="editor-stack">
                <label htmlFor="question-file" className="field-label">
                  Upload file
                </label>

                <label htmlFor="question-file" className="upload-box">
                  <span className="upload-box-title">Choose a JSON file</span>
                  <span className="upload-box-copy">
                    {questionFileName
                      ? `Loaded: ${questionFileName}`
                      : 'Drag in a file or click to browse.'}
                  </span>
                </label>

                <input
                  id="question-file"
                  className="file-input sr-only"
                  type="file"
                  accept=".json,application/json,text/plain"
                  onChange={handleQuestionFileUpload}
                />

                <label htmlFor="question-json" className="field-label">
                  Edit JSON
                </label>
                <textarea
                  id="question-json"
                  className="editor-textarea editor-textarea--lg"
                  value={questionJsonText}
                  onChange={(event) => setQuestionJsonText(event.target.value)}
                />
              </div>
            )}
          </section>

          <section className="editor-card">
            <div className="editor-card-head">
              <div>
                <p className="tiny-label">Preview</p>
                <h2>Detected Questions</h2>
              </div>
              <div className="preview-count">
                {questions.length} {questions.length === 1 ? 'question' : 'questions'}
              </div>
            </div>

            <div className="editor-stack">
              <label htmlFor="question-preview" className="field-label">
                Parsed output
              </label>
              <textarea
                id="question-preview"
                className="editor-textarea editor-textarea--lg preview-textarea"
                readOnly
                value={
                  questions.length > 0
                    ? questions.map((q, i) => `Q${i + 1}. ${q}`).join('\n\n')
                    : 'No questions detected yet.'
                }
              />
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}