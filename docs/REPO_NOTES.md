# Grading Tool Repo Notes (Merged)

This doc merges the former `REPO_NOTES.md` (high-level) and `REPO_DETAILS.md` (deep dive) into a single source of truth.

## Purpose and Scope
The repo provides a rubric-based grading system with three major surfaces:
- CLI batch grading and evaluation for benchmark JSON datasets.
- FastAPI service that exposes grading, survey, rubric revision, evaluation, and calibration endpoints.
- A React frontend that demonstrates the grading workflow and evaluation view.

The LLM-based grading pipeline is implemented in the CLI/core code and is also reachable through the API:
- `POST /api/grade-batch` runs the Gemini-based `RubricGrader` whenever a submission ships with both `rubric` and `question_text` (falls back to the rule-based stub on failure or when those fields are absent).
- `POST /api/evaluation/calibrate` runs the full multi-round calibration loop using `RubricGrader` end-to-end.
- `POST /api/grade` is still the rule-based placeholder kept around for legacy single-answer requests.

## Key Entry Points
- FastAPI app bootstrap: [app/main.py](app/main.py)
- CLI grading run: [src/grading_tool/cli/grade.py](src/grading_tool/cli/grade.py)
- CLI evaluation run: [src/grading_tool/cli/evaluate.py](src/grading_tool/cli/evaluate.py)

## High-Level Architecture
- Core grading pipeline: [src/grading_tool/grading/orchestrator.py](src/grading_tool/grading/orchestrator.py)
- Evaluation metrics: [src/grading_tool/evaluation/agreement.py](src/grading_tool/evaluation/agreement.py)
- API service layer: [app/services/grader_service.py](app/services/grader_service.py)
- UI flows: [frontend/src/App.tsx](frontend/src/App.tsx)

## Runtime Components
### Python Core
- Gemini client wrapper: [src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py)
- Prompt assembly and routing: [src/grading_tool/grading/prompt_builder.py](src/grading_tool/grading/prompt_builder.py), [src/grading_tool/grading/question_type_router.py](src/grading_tool/grading/question_type_router.py)
- Parsing to schema: [src/grading_tool/grading/response_parser.py](src/grading_tool/grading/response_parser.py)
- I/O helpers: [src/grading_tool/utils/io.py](src/grading_tool/utils/io.py)

### API
- App bootstrap + middleware: [app/main.py](app/main.py)
- Endpoints: [app/routes/grading.py](app/routes/grading.py), [app/routes/evaluation.py](app/routes/evaluation.py)
- Schemas: [app/schemas/api_models.py](app/schemas/api_models.py)

### Frontend
- Shell + routes: [frontend/src/App.tsx](frontend/src/App.tsx)
- Pages: [frontend/src/pages/HomePage.tsx](frontend/src/pages/HomePage.tsx), [frontend/src/pages/QuestionIntakePage.tsx](frontend/src/pages/QuestionIntakePage.tsx), [frontend/src/pages/RubricReviewPage.tsx](frontend/src/pages/RubricReviewPage.tsx), [frontend/src/pages/SubmissionGradingPage.tsx](frontend/src/pages/SubmissionGradingPage.tsx), [frontend/src/pages/EvaluationPage.tsx](frontend/src/pages/EvaluationPage.tsx)
- API client: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
- Parsing and mock grading utilities: [frontend/src/lib/gradingUtils.ts](frontend/src/lib/gradingUtils.ts)

## Terminal-only calibration helper
For one-off calibration runs without the API server or frontend, use [scripts/run_calibration.py](scripts/run_calibration.py). It auto-discovers question/rubric/solution/answers/professor_grade files in a benchmark folder and invokes `calibrate_rubric_rounds` directly.

```bash
GEMINI_API_KEY=... python scripts/run_calibration.py \
  --benchmark data/benchmarks/cs302_midterm1_fall2025 \
  --question_id q3 \
  --max_rounds 5
```

Useful flags: `--limit N` (cap submissions for smoke runs), `--no_semantic`, `--target_mse`, `--min_improvement`, `--output`.

## CLI Usage (Batch Pipelines)
### Run a grading job
- Entry point: [src/grading_tool/cli/grade.py](src/grading_tool/cli/grade.py)
```bash
python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/final_prompt_v3.json \
  --run_name final_prompt_v3 \
  --prompt_name prompt_v3
```

### Evaluate a run
- Entry point: [src/grading_tool/cli/evaluate.py](src/grading_tool/cli/evaluate.py)
```bash
python -m src.grading_tool.cli.evaluate \
  --run_path data/outputs/runs/final_prompt_v3.json \
  --professor_grade_path data/benchmarks/cs302_final_fall2025/final_professor_grade.json \
  --output_path data/outputs/reports/final_prompt_v3_eval.json
```

### Common CLI flags
- --question_ids q7 q8
- --limit_students 5
- --limit_questions 2
- --model_name gemini-2.5-pro
- --manifest_path data/benchmarks/.../benchmark_manifest.json

## Data Formats (Ground Truth and Benchmarks)
Schemas are described in [src/grading_tool/schemas/benchmark.py](src/grading_tool/schemas/benchmark.py). Concrete examples are under [data/benchmarks](data/benchmarks).

### Question File
Example: [data/benchmarks/cs302_final_fall2025/final_question.json](data/benchmarks/cs302_final_fall2025/final_question.json)
```json
{
  "course": "CS302",
  "exam": "Final exam",
  "questions": [
    {
      "question_id": "q2",
      "points": 48,
      "benchmark_type": "true_false_with_explanation",
      "subparts": [
        { "part_id": "q2b", "question_text": "..." }
      ]
    }
  ]
}
```

### Rubric File
Example: [data/benchmarks/cs302_final_fall2025/final_rubric.json](data/benchmarks/cs302_final_fall2025/final_rubric.json)
```json
{
  "rubric_version": "1.0",
  "questions": [
    {
      "question_id": "q2",
      "total_points": 48,
      "subparts": [
        {
          "part_id": "q2b",
          "total_points": 8,
          "criteria": [
            { "criterion_id": "q2b_1", "points": 1, "description": "..." }
          ]
        }
      ]
    }
  ]
}
```

### Solutions File
Example: [data/benchmarks/cs302_final_fall2025/final_solution.json](data/benchmarks/cs302_final_fall2025/final_solution.json)
```json
{
  "questions": [
    { "question_id": "q3", "solution": "..." }
  ]
}
```

### Student Answers File
Example: [data/benchmarks/cs302_final_fall2025/final_student_answers.json](data/benchmarks/cs302_final_fall2025/final_student_answers.json)
```json
[
  {
    "student_id": "001",
    "answers": [
      { "question_id": "q2b", "student_answer": "..." }
    ]
  }
]
```

### Professor Grades File
Example: [data/benchmarks/cs302_final_fall2025/final_professor_grade.json](data/benchmarks/cs302_final_fall2025/final_professor_grade.json)
```json
[
  {
    "student_id": "001",
    "grades": [
      { "question_id": "q2b", "score": 8, "score_max": 8 }
    ]
  }
]
```

## Run Payload and Report Formats
### Run Payload
Example: [data/outputs/runs/cs302_midterm2_prompt_v3.json](data/outputs/runs/cs302_midterm2_prompt_v3.json)
```json
{
  "run_name": "cs302_midterm2_prompt_v3",
  "prompt_name": "prompt_v3",
  "benchmark_dir": "data/benchmarks/cs302_midterm2_fall2025",
  "n_results": 79,
  "results": [
    {
      "student_id": "001",
      "question_id": "q2c_i",
      "score_awarded": 5.0,
      "score_max": 5.0,
      "criterion_results": [
        { "criterion_id": "q2c_i_1", "awarded_points": 5.0, "max_points": 5.0 }
      ],
      "feedback": "...",
      "benchmark_type": "automata_and_regex_design",
      "parent_question_id": "q2"
    }
  ]
}
```

### Evaluation Report
Example: [data/outputs/reports/cs302_midterm2_prompt_v3_eval.json](data/outputs/reports/cs302_midterm2_prompt_v3_eval.json)
```json
{
  "run_name": "cs302_midterm2_prompt_v3",
  "n_graded": 79,
  "mae": 3.35,
  "mse": 27.41,
  "exact_match_rate": 0.456,
  "pearson_correlation": 0.735,
  "per_question": [
    { "question_id": "q2c_i", "mae": 1.875, "mse": 9.375, "n": 8 }
  ]
}
```

## Grading Pipeline Details (CLI/Core)
Key path: [src/grading_tool/grading/orchestrator.py](src/grading_tool/grading/orchestrator.py)
1. Resolve benchmark files (question/rubric/solution/answers) via direct paths or manifest.
2. Build indices for question, rubric, and solution (including subparts).
3. For each student answer, run rubric grading:
   - Prompt assembly: [src/grading_tool/grading/prompt_builder.py](src/grading_tool/grading/prompt_builder.py)
   - Question-type guidance: [src/grading_tool/grading/question_type_router.py](src/grading_tool/grading/question_type_router.py)
   - LLM call: [src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py)
   - Parse to schema: [src/grading_tool/grading/response_parser.py](src/grading_tool/grading/response_parser.py)
4. Save run payload with metadata, results, and any skipped items.

## Prompt Configuration
Prompt variants live in [configs/prompts.yaml](configs/prompts.yaml). Each prompt config defines:
- style: short | structured | detailed | strict_conservative
- rubric_mode: criterion_only | criterion_plus_reasoning
- allow_reference_solution, allow_implicit_reasoning
- partial_credit_style: strict | moderate | generous
- grader_note (prompt-specific guidance)

Prompt strategy notes: [src/grading_tool/grading/prompt_strategy.md](src/grading_tool/grading/prompt_strategy.md)

## Config Files
- Prompt config: [configs/prompts.yaml](configs/prompts.yaml)
- Base config: [configs/base.yaml](configs/base.yaml) (currently empty)
- Scoring config: [configs/scoring.yaml](configs/scoring.yaml) (currently empty)

## Evaluation and Metrics
- Main evaluation logic: [src/grading_tool/evaluation/agreement.py](src/grading_tool/evaluation/agreement.py)
- Metric functions: [src/grading_tool/evaluation/metrics.py](src/grading_tool/evaluation/metrics.py)
- Metric rationale: [src/grading_tool/evaluation/evaluation.md](src/grading_tool/evaluation/evaluation.md)

### Normalized Metrics
Normalized metrics divide score by per-question max, giving a 0-1 scale:
- normalized MAE and MSE
- normalized error variance
- normalized within-threshold rate

### Semantic Metrics
- BERTScore and cosine similarity are optional and require extra packages.
- Implementations are in [src/grading_tool/evaluation/metrics.py](src/grading_tool/evaluation/metrics.py).

## Calibration and Rubric Revision
- Calibration loop: [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py)
- Rubric revision notes: [src/grading_tool/grading/rubric_reviser.py](src/grading_tool/grading/rubric_reviser.py)

Flow summary:
1. Grade submissions with a grading function.
2. Evaluate vs professor grades.
3. Generate rubric revision notes based on flagged cases or mistake stats.
4. Stop if target MSE or minimal improvement criteria are met.

## API Surface (FastAPI)
Endpoints are defined in [app/routes](app/routes).

### Grading and Review
- GET /api/runs (demo list)
- POST /api/grade
- POST /api/grade-batch
- POST /api/survey-submissions
- POST /api/mistake-stats
- POST /api/revise-rubric

### Evaluation and Calibration
- POST /api/evaluation/run
- POST /api/evaluation/calibrate

### Example: /api/grade
Request schema: [app/schemas/api_models.py](app/schemas/api_models.py)
```json
{ "student_id": "S1", "answer": "...", "question_id": "Q1" }
```
Response (rule-based placeholder today):
```json
{
  "student_id": "S1",
  "question_id": "Q1",
  "score": 7.0,
  "max_score": 10.0,
  "confidence": 0.78,
  "review_required": true,
  "review_reason": "Borderline score",
  "reasoning": "Good answer but missing some detail."
}
```

### Example: /api/grade-batch
Request:
```json
{ "submissions": [ { "student_id": "S1", "answer": "...", "question_id": "Q1" } ] }
```
Response (summary + per-student results):
```json
{
  "count": 1,
  "average_score": 7.0,
  "review_count": 1,
  "review_queue": [
    { "student_id": "S1", "question_id": "Q1", "score": 7.0, "confidence": 0.78, "reason": "Borderline score" }
  ],
  "results": [ { "student_id": "S1", "question_id": "Q1", "score": 7.0, "max_score": 10.0 } ]
}
```

### Example: /api/evaluation/run
```json
{
  "ai_results": [ { "student_id": "S1", "question_id": "Q1", "score": 7.0, "max_score": 10.0 } ],
  "professor_grades": [ { "student_id": "S1", "question_id": "Q1", "score": 8.0, "max_score": 10.0 } ],
  "difference_threshold": 0.5,
  "include_semantic_metrics": true
}
```

Response (abridged):
```json
{
  "count": 1,
  "metrics": { "mse": 1.0, "mae": 1.0, "within_threshold_rate": 0.0 },
  "flagged_count": 1,
  "flagged_cases": [ { "student_id": "S1", "question_id": "Q1", "difference": -1.0, "flagged": true } ]
}
```

## Frontend Flow Details
### Question Intake
File: [frontend/src/pages/QuestionIntakePage.tsx](frontend/src/pages/QuestionIntakePage.tsx)
- Accepts CSV or JSON question lists.
- Parses inputs into normalized question objects.
- Writes parsed questions into localStorage (key: grading_questions).

### Rubric Review
File: [frontend/src/pages/RubricReviewPage.tsx](frontend/src/pages/RubricReviewPage.tsx)
- Reads questions from localStorage (if present) and builds rubric draft.
- Allows revision feedback and regenerates a revised rubric.
- Tracks draft status (draft, revised, approved).

### Submission Grading
File: [frontend/src/pages/SubmissionGradingPage.tsx](frontend/src/pages/SubmissionGradingPage.tsx)
- Accepts CSV or JSON submission data.
- Normalizes inputs and posts to /api/grade-batch.
- Displays summary stats, distributions, and review decisions.

### Evaluation
File: [frontend/src/pages/EvaluationPage.tsx](frontend/src/pages/EvaluationPage.tsx)
- Wired live to the backend. Accepts submissions JSON, professor grades JSON, and a rubric.
- Buttons call [gradeBatch / runEvaluation / runCalibration](frontend/src/lib/api.ts) against `POST /api/grade-batch`, `/api/evaluation/run`, and `/api/evaluation/calibrate`.
- Backend URL + Gemini API key are configurable in the Settings panel and persisted via `loadApiSettings`/`saveApiSettings`. The key is forwarded as `X-API-Key`.
- Displays per-submission comparisons, flagged cases, and per-round calibration results.

## Testing
- Metrics unit tests: [tests/test_evaluation_metrics.py](tests/test_evaluation_metrics.py)
- Loader sanity check: [tests/test_loader.py](tests/test_loader.py)
- Grading schema validation: [tests/test_rubric_grader_schema.py](tests/test_rubric_grader_schema.py)

## Known Gaps and TODOs
- `POST /api/grade` is still the rule-based `score_answer()` placeholder. The batch endpoint and calibration loop run real Gemini grading.
- Evaluation schema in [src/grading_tool/schemas/evaluation.py](src/grading_tool/schemas/evaluation.py) does not reflect the full report structure produced by [src/grading_tool/evaluation/agreement.py](src/grading_tool/evaluation/agreement.py).
- Semantic metrics (`cosine_similarity_mean`, `bert_similarity_mean`) are still returned as `None` from the API evaluation path even when `include_semantic_metrics=true`.
- `POST /api/runs` returns hard-coded demo data; no real run registry yet.

