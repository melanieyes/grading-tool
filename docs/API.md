# API Reference (FastAPI)

The FastAPI app is defined in [app/main.py](app/main.py). Routes are organized in [app/routes](app/routes).

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

## Important note (current behavior)
The API’s grading endpoints currently use a **rule-based placeholder** grader (`score_answer()` in [app/services/grader_service.py](app/services/grader_service.py)).

The Gemini rubric grading pipeline exists in the core/CLI code under [src/grading_tool/grading](src/grading_tool/grading) and is not yet wired into the API.

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
Request: `BatchGradeRequest`
```json
{
  "submissions": [
    { "student_id": "S1", "answer": "...", "question_id": "Q1" }
  ]
}
```

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
- `original_rubric`, `submissions`, `professor_grades`
- `max_rounds`, thresholds, stopping parameters

Response: `CalibrationResponse`
- `rounds[]` contains `grade_results` and evaluation summaries per round.

## CORS
CORS origins are configured in [app/main.py](app/main.py) to allow common localhost dev ports.
