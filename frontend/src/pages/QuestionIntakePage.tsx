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
    <main className="page-content">
      <section className="page-header-card">
        <p className="eyebrow">Question Intake</p>
        <h1 className="page-title">Add and preview question sets</h1>
        <p className="page-copy">
          Start with manual text entry or upload a structured JSON file.
        </p>
      </section>

      <section className="section-panel">
        <div className="mode-switch">
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

        <div className="builder-grid">
          <div className="editor-block">
            {intakeMode === 'manual' ? (
              <>
                <label htmlFor="question-manual">Question Set</label>
                <textarea
                  id="question-manual"
                  value={questionText}
                  onChange={(event) => setQuestionText(event.target.value)}
                />
              </>
            ) : (
              <>
                <label htmlFor="question-file">Upload Question JSON</label>
                <input
                  id="question-file"
                  className="file-input"
                  type="file"
                  accept=".json,application/json,text/plain"
                  onChange={handleQuestionFileUpload}
                />
                <p className="file-hint">
                  {questionFileName ? `Loaded: ${questionFileName}` : 'No file uploaded yet.'}
                </p>

                <label htmlFor="question-json">Question JSON</label>
                <textarea
                  id="question-json"
                  value={questionJsonText}
                  onChange={(event) => setQuestionJsonText(event.target.value)}
                />
              </>
            )}
          </div>

          <div className="editor-block">
            <label htmlFor="question-preview">Detected Questions</label>
            <textarea
              id="question-preview"
              readOnly
              value={
                questions.length > 0
                  ? questions.map((q, i) => `Q${i + 1}. ${q}`).join('\n\n')
                  : 'No questions detected yet.'
              }
            />
          </div>
        </div>
      </section>
    </main>
  )
}