const sampleReport = {
  run_name: 'prompt_v4_student_batch',
  prompt_name: 'prompt_v4',
  model_name: 'gemini-1.5-flash',
  n_graded: 40,
  mae: 1.15,
  mse: 2.04,
  exact_match_rate: 0.38,
  pearson_correlation: 0.82,
  spearman_correlation: 0.79,
  bertscore_f1: 0.86,
  average_cosine_similarity: 0.84,
  per_question: [
    { question_id: 'q_tm_01', mae: 1.1, mse: 1.9, exact_match_rate: 0.4, n: 8 },
    { question_id: 'q_tm_02', mae: 1.3, mse: 2.4, exact_match_rate: 0.3, n: 8 },
    { question_id: 'q_tm_03', mae: 0.9, mse: 1.6, exact_match_rate: 0.5, n: 8 },
    { question_id: 'q_tm_04', mae: 1.5, mse: 2.8, exact_match_rate: 0.25, n: 8 },
    { question_id: 'q_tm_05', mae: 1.0, mse: 1.5, exact_match_rate: 0.45, n: 8 },
  ],
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
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

export default function EvaluationPage() {
  const report = sampleReport

  function handleExportCsv() {
    const rows = [
      ['metric', 'value'],
      ['mae', report.mae.toFixed(2)],
      ['exact_match_rate', report.exact_match_rate.toFixed(2)],
      ['bertscore_f1', report.bertscore_f1.toFixed(2)],
      ['average_cosine_similarity', report.average_cosine_similarity.toFixed(2)],
      ['pearson_correlation', report.pearson_correlation.toFixed(2)],
      ['spearman_correlation', report.spearman_correlation.toFixed(2)],
    ]

    downloadFile('evaluation_metrics.csv', rows.map((row) => row.join(',')).join('\n'), 'text/csv')
  }

  function handleExportPdf() {
    const html = `
      <html>
        <head>
          <title>Evaluation Summary</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #102246; }
            h1, h2 { margin: 0 0 8px; }
            p { line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #d7def0; padding: 10px; text-align: left; vertical-align: top; }
            th { background: #f3f6ff; }
            .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 20px 0; }
            .metric { border: 1px solid #d7def0; border-radius: 12px; padding: 12px 14px; }
            .metric strong { display: block; margin-top: 6px; font-size: 1.2rem; }
          </style>
        </head>
        <body>
          <h1>Evaluation Summary</h1>
          <p>Run: ${report.run_name} | Model: ${report.model_name} | Prompt: ${report.prompt_name} | Graded: ${report.n_graded}</p>

          <h2>Core Metrics</h2>
          <div class="metric-grid">
            <div class="metric"><span>MAE</span><strong>${report.mae.toFixed(2)}</strong><p>Score distance</p></div>
            <div class="metric"><span>Exact Match</span><strong>${percent(report.exact_match_rate)}</strong><p>Strict agreement</p></div>
            <div class="metric"><span>BERTScore F1</span><strong>${report.bertscore_f1.toFixed(2)}</strong><p>Semantic feedback similarity</p></div>
            <div class="metric"><span>Cosine Similarity</span><strong>${report.average_cosine_similarity.toFixed(2)}</strong><p>Embedding-based similarity</p></div>
          </div>

          <h2>Metric Interpretation</h2>
          <p>MAE measures how far the AI score is from the professor score on average.</p>
          <p>Exact Match measures how often the AI gives exactly the same score as the professor.</p>
          <p>BERTScore uses contextual BERT embeddings to compare the meaning of generated feedback against reference feedback.</p>
          <p>Cosine Similarity compares sentence embeddings with cosine distance to measure semantic closeness between feedback texts.</p>
          <p>Pearson: ${report.pearson_correlation.toFixed(2)} | Spearman: ${report.spearman_correlation.toFixed(2)}</p>

          <h2>Per-Question Evaluation</h2>
          <table>
            <tr>
              <th>Question</th>
              <th>MAE</th>
              <th>MSE</th>
              <th>Exact Match</th>
              <th>N Graded</th>
            </tr>
            ${report.per_question.map((q) => `
              <tr>
                <td>${q.question_id}</td>
                <td>${q.mae.toFixed(2)}</td>
                <td>${q.mse.toFixed(2)}</td>
                <td>${percent(q.exact_match_rate)}</td>
                <td>${q.n}</td>
              </tr>
            `).join('')}
          </table>
        </body>
      </html>
    `

    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(html)
    win.document.close()
    win.print()
  }

  return (
    <main className="shell page">
      <section className="page-head compact-head">
        <div>
          <p className="eyebrow">Evaluation Metrics</p>
          <h1>Measure grading alignment</h1>
          <p className="subtle">
            Compare AI grading against professor scores using score alignment and semantic similarity.
            BERTScore and cosine similarity are included as required NLP evaluation metrics.
          </p>
        </div>

        <div className="export-actions">
          <button type="button" className="ghost-btn" onClick={handleExportCsv}>
            Export CSV
          </button>
          <button type="button" className="primary-btn" onClick={handleExportPdf}>
            Export PDF
          </button>
        </div>
      </section>

      <section className="panel result-overview">
        <div className="metric-card">
          <span>MAE</span>
          <strong>{report.mae.toFixed(2)}</strong>
          <p>Score distance</p>
        </div>

        <div className="metric-card">
          <span>Exact Match</span>
          <strong>{percent(report.exact_match_rate)}</strong>
          <p>Strict agreement</p>
        </div>

        <div className="metric-card">
          <span>BERTScore F1</span>
          <strong>{report.bertscore_f1.toFixed(2)}</strong>
          <p>Semantic feedback similarity</p>
        </div>

        <div className="metric-card">
          <span>Cosine Similarity</span>
          <strong>{report.average_cosine_similarity.toFixed(2)}</strong>
          <p>Embedding-based similarity</p>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <h3>Metric Interpretation</h3>
            <span className="tiny-label">Professor alignment</span>
          </div>
        </div>

        <div className="evaluation-grid">
          <article className="evaluation-card">
            <h4>MAE</h4>
            <p>
              Measures how far the AI score is from the professor score on average.
              Lower is better.
            </p>
          </article>

          <article className="evaluation-card">
            <h4>Exact Match</h4>
            <p>
              Measures how often the AI gives exactly the same score as the professor.
              Higher is better.
            </p>
          </article>

          <article className="evaluation-card">
            <h4>BERTScore</h4>
            <p>
              Uses contextual BERT embeddings to compare the meaning of generated feedback
              against reference feedback.
            </p>
          </article>

          <article className="evaluation-card">
            <h4>Cosine Similarity</h4>
            <p>
              Compares sentence embeddings with cosine distance to measure semantic closeness
              between feedback texts.
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Secondary Trend Metrics</h3>
          <span className="tiny-label">Ranking consistency</span>
        </div>

        <div className="table-wrap">
          <table className="clean-table clean-table--compact">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Interpretation</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td className="mono-cell">Pearson</td>
                <td>{report.pearson_correlation.toFixed(2)}</td>
                <td>Score trend alignment</td>
              </tr>
              <tr>
                <td className="mono-cell">Spearman</td>
                <td>{report.spearman_correlation.toFixed(2)}</td>
                <td>Ranking consistency</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Per-Question Evaluation</h3>
          <span className="tiny-label">Rubric-level diagnosis</span>
        </div>

        <div className="table-wrap">
          <table className="clean-table clean-table--compact">
            <thead>
              <tr>
                <th>Question</th>
                <th>MAE</th>
                <th>MSE</th>
                <th>Exact Match</th>
                <th>N Graded</th>
              </tr>
            </thead>

            <tbody>
              {report.per_question.map((q) => (
                <tr key={q.question_id}>
                  <td className="mono-cell">{q.question_id}</td>
                  <td>{q.mae.toFixed(2)}</td>
                  <td>{q.mse.toFixed(2)}</td>
                  <td>{percent(q.exact_match_rate)}</td>
                  <td>{q.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}