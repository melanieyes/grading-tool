# API Reference (FastAPI)

The FastAPI app is defined in [app/main.py](app/main.py). Routes are organized in [app/routes](app/routes).

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

## Important note (current behavior)
Grading endpoints are a mix of LLM-backed and rule-based paths:

| Endpoint | Behavior |
| --- | --- |
| `POST /api/grade` | Rule-based placeholder (`score_answer()` in [app/services/grader_service.py](app/services/grader_service.py)). Kept for legacy single-answer demos. |
| `POST /api/grade-batch` | Uses the Gemini `RubricGrader` when each submission supplies both `rubric` and `question_text`; otherwise falls back to `score_answer()`. |
| `POST /api/evaluation/calibrate` | Runs the full multi-round calibration loop end-to-end through `RubricGrader`. |
| `POST /api/survey-submissions`, `/api/mistake-stats`, `/api/revise-rubric` | Rule-based heuristics today, except `/api/revise-rubric` which delegates to the core `revise_rubric` logic in [src/grading_tool/grading/rubric_reviser.py](src/grading_tool/grading/rubric_reviser.py). |

### Passing the Gemini API key
Endpoints that invoke `RubricGrader` (`/api/grade-batch`, `/api/evaluation/calibrate`) read the key from request headers so the server does not need a process-level `GEMINI_API_KEY`:
- `X-API-Key: <key>`, or
- `Authorization: Bearer <key>`

If neither header is present, `RubricGrader` falls back to `os.environ["GEMINI_API_KEY"]`.

## Health
### GET /api/health
Defined in [app/routes/health.py](app/routes/health.py).

Response:
```json
{ "status": "ok" }
```

## Grading
### POST /api/grade
Defined in [app/routes/grading.py](app/routes/grading.py).

Request schema: `GradeRequest` in [app/schemas/api_models.py](app/schemas/api_models.py)
```json
{ "student_id": "S1", "answer": "...", "question_id": "Q1" }
```

Response schema: `GradeResult`
```json
{
  "student_id": "S1",
  "question_id": "Q1",
  "score": 7.0,
  "max_score": 10.0,
  "confidence": 0.78,
  "review_required": true,
  "review_reason": "Borderline score",
  "reasoning": "..."
}
```

### POST /api/grade-batch
Each submission in `submissions` may include `rubric`, `question_text`, `max_score`, `benchmark_type`, and `reference_solution`. Providing both `rubric` and `question_text` routes that submission through the Gemini `RubricGrader`; submissions missing either field fall through to the rule-based scorer.

Request: `BatchGradeRequest`
```json
{
  "submissions": [
    {
      "student_id": "S1",
      "question_id": "q3",
      "answer": "...",
      "question_text": "Enumerate all algorithm design techniques...",
      "rubric": { "criteria": [ { "criterion_id": "c1", "points": 4, "description": "..." } ] },
      "max_score": 12,
      "benchmark_type": "short_answer",
      "reference_solution": "..."
    }
  ]
}
```

Headers: `X-API-Key: <gemini_key>` (or `Authorization: Bearer <gemini_key>`) is required for Gemini-backed submissions.

Response: `BatchGradeResponse`
- `results`: list of `GradeResult`
- `review_queue`: items requiring review

## Survey + Mistakes
### POST /api/survey-submissions
Request: `SurveyBatchRequest`
- Accepts `question_text`, optional `rubric` and `solution`, and `submissions`.

Response: `SurveyBatchResponse` containing `SurveyCommentResult[]`.

### POST /api/mistake-stats
Request: `MistakeStatsRequest` with survey results.

Response: `MistakeStatsResponse` with mistake clusters.

## Rubric revision
### POST /api/revise-rubric
Request: `RubricRevisionRequest`
- `original_rubric`
- optional `mistake_stats`
- optional `instructor_note`

Response: `RubricRevisionResponse`
- `revision_needed`
- `revised_rubric`
- `change_log`

## Evaluation
### GET /api/evaluation/health
Defined in [app/routes/evaluation.py](app/routes/evaluation.py).

### POST /api/evaluation/run
Request: `EvaluationRequest`
- `ai_results`: `GradeResult[]`
- `professor_grades`: `ProfessorGradeInput[]`
- `difference_threshold`
- `include_semantic_metrics`

Response: `EvaluationResponse`
- `metrics`: MAE/MSE/variance/within-threshold
- `flagged_cases`

Note: semantic metrics fields exist in schemas, but the current implementation returns `None` for semantic similarity.

## Calibration
### POST /api/evaluation/calibrate
Request: `CalibrationRequest`
- `question_id`, `question_text`, `original_rubric`, `solution`
- `submissions` (`GradeRequest[]`), `professor_grades` (`ProfessorGradeInput[]`)
- `max_rounds` (default 5), `difference_threshold` (default 0.5), `target_mse`, `min_improvement` (default 0.01), `include_semantic_metrics`

Headers: `X-API-Key: <gemini_key>` (or `Authorization: Bearer <gemini_key>`). Required — every round invokes `RubricGrader`.

Response: `CalibrationResponse`
- `completed_rounds`, `best_round_index`, `best_mse`, `best_rubric`, `stopping_reason`
- `rounds[]` contains the rubric used, `grade_results`, the full `EvaluationResponse`, and a `revision_note` per round

For a non-API entry point, see [scripts/run_calibration.py](scripts/run_calibration.py).

## CORS
CORS is configured in [app/main.py](app/main.py). Allowed origins include:
- Localhost dev ports `5173`, `5174`, `4173` (both `localhost` and `127.0.0.1`).
- Production Vercel deployments (`grading-tool-beige.vercel.app`, `grading-tool-ruby.vercel.app`).
- An `allow_origin_regex` that additionally permits any `*.vercel.app` host and LAN-private IPs (`10.x`, `172.16–31.x`, `192.168.x`, `100.x`) on ports `5173`/`5174`, so Vite served on a LAN IP works without CORS errors.
