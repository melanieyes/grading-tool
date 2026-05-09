import React, { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type RowStatus = 'draft' | 'approved' | 'manual_override' | 'revised'

function loadSavedQuestions() {
  try {
    const saved = localStorage.getItem('grading_questions')
    if (!saved) return []
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function RubricReviewPage() {
  const [questions, setQuestions] = useState<any[]>([])
  
  // State for Rubrics and UI tracking
  const [rubrics, setRubrics] = useState<Record<string, string>>({})
  const [rowStatuses, setRowStatuses] = useState<Record<string, RowStatus>>({})
  const [globalStatus, setGlobalStatus] = useState<'draft' | 'generated' | 'approved'>('draft')

  // Inline Revision State
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null)
  const [revisionPrompt, setRevisionPrompt] = useState<string>('')

  useEffect(() => {
    setQuestions(loadSavedQuestions())
  }, [])

  function handleGenerateAllRubrics() {
    const newRubrics: Record<string, string> = {}
    const newStatuses: Record<string, RowStatus> = {}
    
    questions.forEach((q) => {
      if (q.subparts && q.subparts.length > 0) {
        q.subparts.forEach((sub: any) => {
          newRubrics[sub.part_id] = `- Correct concept (0-${Math.floor(sub.max_score / 2)})\n- Clear reasoning (0-${Math.ceil(sub.max_score / 2)})`
          newStatuses[sub.part_id] = 'draft'
        })
      } else {
        newRubrics[q.question_id] = `- Correct concept (0-${Math.floor(q.max_score / 2)})\n- Clear reasoning (0-${Math.ceil(q.max_score / 2)})`
        newStatuses[q.question_id] = 'draft'
      }
    })

    setRubrics(newRubrics)
    setRowStatuses(newStatuses)
    setGlobalStatus('generated')
  }

  function handleRubricChange(id: string, newText: string) {
    setRubrics((prev) => ({ ...prev, [id]: newText }))
  }

  // --- Row Action Handlers ---
  
  function handleApproveRow(id: string) {
    setRowStatuses(prev => ({ ...prev, [id]: 'approved' }))
    setActiveRevisionId(null)
  }

  function handleUndoApprove(id: string) {
    setRowStatuses(prev => ({ ...prev, [id]: 'draft' }))
  }

  function handleToggleManual(id: string) {
    setRowStatuses(prev => ({ 
      ...prev, 
      [id]: prev[id] === 'manual_override' ? 'draft' : 'manual_override' 
    }))
    setActiveRevisionId(null)
  }

  function handleOpenRevision(id: string) {
    setActiveRevisionId(id)
    setRevisionPrompt('')
  }

  function submitRevision(id: string) {
    if (!revisionPrompt.trim()) return;

    // Mocking the targeted LLM response
    setRubrics(prev => ({
      ...prev,
      [id]: prev[id] + `\n\n[AI Applied Revision: "${revisionPrompt}"]`
    }))
    
    setRowStatuses(prev => ({ ...prev, [id]: 'revised' }))
    setActiveRevisionId(null)
    setRevisionPrompt('')
  }

  // --- Render Helpers for Cell Layouts ---

  const renderRubricCell = (id: string) => {
    const status = rowStatuses[id] || 'draft'
    const isManual = status === 'manual_override'
    const isApproved = status === 'approved'

    // If global draft, show empty disabled box
    if (globalStatus === 'draft') {
       return <td><textarea className="editor-textarea preview-textarea" style={{ minHeight: '120px' }} readOnly placeholder="Waiting for generation..." /></td>
    }

    return (
      <td>
        <textarea 
          className={`editor-textarea ${!isManual ? 'preview-textarea' : ''}`}
          style={{ minHeight: '120px', padding: '12px' }}
          value={rubrics[id] || ''}
          onChange={(e) => handleRubricChange(id, e.target.value)}
          readOnly={!isManual}
          placeholder={isManual ? "Type manual override here..." : ""}
        />
        
        {/* Inline Revision Dropdown */}
        {activeRevisionId === id && (
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--info-bg)', borderRadius: '12px', border: '1px solid var(--brand-200)' }}>
            <p className="tiny-label" style={{ marginBottom: '8px', color: 'var(--brand-700)' }}>Targeted AI Revision Prompt</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text"
                className="text-input"
                style={{ flex: 1, minHeight: '36px', padding: '0 12px', fontSize: '0.9rem' }}
                placeholder="E.g., 'Make it 5 points total, add a 2pt penalty if they forget context switching'..."
                value={revisionPrompt}
                onChange={(e) => setRevisionPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitRevision(id)}
                autoFocus
              />
              <button className="primary-btn" style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }} onClick={() => submitRevision(id)}>
                Regenerate
              </button>
              <button className="ghost-btn" style={{ minHeight: '36px', padding: '0 12px', fontSize: '0.85rem' }} onClick={() => setActiveRevisionId(null)}>
                Cancel
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
          <span className="status-pill status-pill--neutral" style={{ opacity: 0.5 }}>Pending</span>
        </td>
      )
    }

    const status = rowStatuses[id] || 'draft'
    const isApproved = status === 'approved'
    const isManual = status === 'manual_override'
    const isRevised = status === 'revised'

    return (
      <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          {isApproved ? (
            <span className="status-pill status-pill--success" style={{ width: '100%' }}>Approved</span>
          ) : isManual ? (
            <span className="status-pill status-pill--warning" style={{ width: '100%' }}>Manual Edit</span>
          ) : isRevised ? (
            <span className="status-pill status-pill--info" style={{ width: '100%' }}>Revised</span>
          ) : (
            <span className="status-pill status-pill--neutral" style={{ width: '100%' }}>Draft</span>
          )}

          {!isApproved && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
              <button className="row-action-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleApproveRow(id)}>Approve</button>
              <button className="row-action-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleOpenRevision(id)}>Revise</button>
              <button className="row-action-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleToggleManual(id)}>
                {isManual ? 'Lock' : 'Manual'}
              </button>
            </div>
          )}

          {isApproved && (
            <button className="row-action-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => handleUndoApprove(id)}>Undo</button>
          )}
        </div>
      </td>
    )
  }

  return (
    <main className="shell rubric-page">
      <section className="panel rubric-hero">
        <div className="rubric-hero-copy">
          <p className="eyebrow">Rubric Review</p>
          <h1 className="rubric-title rubric-title--compact">Refine Rubric</h1>
          <p className="rubric-copy">
            Review the generated grading criteria against the original prompts. Adjust weights and reasoning expectations before approving.
          </p>
        </div>

        <div className="rubric-hero-meta">
          <div className="hero-stat">
            <span>Questions</span>
            <strong>{questions.length} main topics</strong>
          </div>
          <div className="hero-stat">
            <span>System Status</span>
            <strong>{globalStatus === 'draft' ? 'Waiting for Generation' : 'Drafts Ready'}</strong>
          </div>
        </div>
      </section>

      <section className="panel rubric-builder">
        <div className="panel-head">
          <div>
            <h3>Grading Criteria</h3>
            <span className="tiny-label">Line-by-line review</span>
          </div>

          <div className="action-stack">
            {globalStatus === 'draft' ? (
              <button type="button" className="primary-btn" onClick={handleGenerateAllRubrics}>
                Generate All Rubrics
              </button>
            ) : (
              <Link to="/grading" className="primary-btn">
                Approve All & Continue
              </Link>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr>
                <th className="center-col" style={{ width: '60px' }}>Index</th>
                <th colSpan={2} style={{ width: '120px' }}>Q. ID</th>
                <th style={{ width: '30%' }}>Question</th>
                <th style={{ width: '45%' }}>Scoring Rubric</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Status / Action</th>
              </tr>
            </thead>

            <tbody>
              {questions.length > 0 ? (
                questions.map((q, index) => {
                  const hasSubparts = q.subparts && q.subparts.length > 0

                  if (hasSubparts) {
                    // Check if all subparts are approved to highlight the parent row
                    const allApproved = q.subparts.every((sub: any) => rowStatuses[sub.part_id] === 'approved')
                    const parentBg = allApproved ? 'rgba(31, 153, 91, 0.05)' : ''

                    return (
                      <Fragment key={q.question_id}>
                        {/* Parent Context Row */}
                        <tr style={{ backgroundColor: parentBg, transition: 'background-color 0.3s ease' }}>
                          <td className="center-col" rowSpan={q.subparts.length + 1}>{index + 1}</td>
                          <td 
                            className="mono-cell" 
                            rowSpan={q.subparts.length + 1} 
                            style={{ verticalAlign: 'top', borderRight: '1px solid var(--line)' }}
                          >
                            {q.question_id}
                          </td>
                          <td className="mono-cell" style={{ color: 'var(--ink-500)', fontSize: '0.8rem' }}>—</td>
                          <td colSpan={3}>
                            <strong style={{ color: 'var(--ink-900)' }}>{q.question}</strong>
                          </td>
                        </tr>
                        {/* Subpart Rows */}
                        {q.subparts.map((sub: any) => {
                          const isApproved = rowStatuses[sub.part_id] === 'approved'
                          return (
                            <tr key={sub.part_id} style={{ backgroundColor: isApproved ? 'rgba(31, 153, 91, 0.05)' : '', transition: 'background-color 0.3s ease' }}>
                              <td className="mono-cell">{sub.part_id}</td>
                              <td>{sub.question}</td>
                              {renderRubricCell(sub.part_id)}
                              {renderActionCell(sub.part_id)}
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  }

                  {/* Flat Row (No Subparts) */}
                  const isApproved = rowStatuses[q.question_id] === 'approved'
                  return (
                    <tr key={q.question_id} style={{ backgroundColor: isApproved ? 'rgba(31, 153, 91, 0.05)' : '', transition: 'background-color 0.3s ease' }}>
                      <td className="center-col">{index + 1}</td>
                      <td className="mono-cell" colSpan={2}>{q.question_id}</td>
                      <td>{q.question}</td>
                      {renderRubricCell(q.question_id)}
                      {renderActionCell(q.question_id)}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="center-col" colSpan={6}>
                    No questions available. Please go back to Intake.
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