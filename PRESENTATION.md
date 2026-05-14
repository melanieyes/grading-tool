# Grading Tool — Project Presentation

> A hybrid (deterministic + LLM) rubric‑grading platform for exam-style short‑answer questions.
> Combines a Python core library, a FastAPI backend, and a React/Vite frontend, with **Google Gemini** as the underlying LLM.

---

## 0. The Big Picture (60-second overview)

The Grading Tool helps an instructor go from **raw questions + student answers** to **graded results with quality assurance** in four stages:

1. **Generate** a rubric from each question (LLM).
2. **Grade** all student submissions against the rubric (LLM).
3. **Evaluate** the AI grades against the professor's ground-truth grades (metrics).
4. **Calibrate** — iteratively revise the rubric to reduce disagreement with the professor (LLM-in-the-loop).

Three layers:
- **Frontend** (React/Vite, 4 pages) → user-facing workflow.
- **Backend** (FastAPI) → thin routing layer over the core library.
- **Core library** (`src/grading_tool/`) → LLM client, prompt builder, grader, calibrator, metrics.

Determinism is a deliberate design choice: Gemini is called with `temperature=0, top_p=1, top_k=1`, so the same input produces the same output. This makes calibration MSE deltas attributable to rubric changes, not LLM sampling noise.

---

## 1. Frontend

### 1.1 Stack
- **React 19** + **TypeScript** + **React Router 7**, built with **Vite 8**.
- **jsPDF** + **jspdf-autotable** for PDF export of grading results.
- Dev server: `npm run dev` → `http://localhost:5173`.
- Talks to the backend at `http://localhost:8000` (override with `VITE_API_BASE_URL`).

### 1.2 Pages (4 routes)

Defined in [App.tsx](frontend/src/App.tsx).

| Route | File | Purpose |
|-------|------|---------|
| `/` | [HomePage.tsx](frontend/src/pages/HomePage.tsx) | Landing page — explains the project and workflow. |
| `/intake` | [QuestionIntakePage.tsx](frontend/src/pages/QuestionIntakePage.tsx) | Upload questions JSON → **generate rubrics** via LLM → review/revise. |
| `/grading` | [SubmissionGradingPage.tsx](frontend/src/pages/SubmissionGradingPage.tsx) | Upload submissions → **grade in batch** → edit / approve / reject → export JSON or PDF. |
| `/evaluation` | [EvaluationPage.tsx](frontend/src/pages/EvaluationPage.tsx) | **Evaluate** AI vs. professor grades, and run multi-round **calibration**. |

#### 1.2.1 HomePage
Static landing page introducing the tool, with navigation to the three workflow pages.

#### 1.2.2 QuestionIntakePage (`/intake`)
- Accepts a JSON file of questions: `{question_id, question_text, max_score, reference_solution?}`.
- Stores questions in `localStorage["grading_questions"]`.
- **Generate Rubric** → fires one parallel `POST /api/generate-rubric` call per question, shows a progress bar (real progress + time-based trickle).
- **Revise Rubric** → user types a free-form "revision focus" string; calls `POST /api/revise-rubric-llm`.
- Saves rubrics keyed by `question_id` to `localStorage["grading_rubrics"]`.

#### 1.2.3 SubmissionGradingPage (`/grading`)
- Accepts a JSON list of submissions: `{student_id, question_id, answer}`.
- Pulls saved rubrics + questions from localStorage.
- Calls `POST /api/grade-batch` (one batch request for all submissions).
- Renders a 7-column table (Index · Student ID · Question ID · Score · Status · Reasoning · Actions).
- Per-row UX:
  - Inline edit of score and reasoning.
  - Approve / Reject decision buttons.
  - All edits persisted to localStorage (`grading_edited_scores`, `grading_edited_reasoning`, `grading_decisions`).
- **Export**: JSON (with overrides applied) or **PDF** (real file download via jsPDF — not the print dialog).

#### 1.2.4 EvaluationPage (`/evaluation`)
Two tabs:
- **Compare AI vs Professor** — calls `POST /api/evaluation/run` and shows metric cards (MSE, MAE, score variance, error variance, within-threshold rate) plus a flagged-cases table (over/under-credit).
- **Improve the Rubric** — calls `POST /api/evaluation/calibrate` and renders round-by-round results with the best-round highlighted.

### 1.3 Frontend ↔ Backend connector

All HTTP calls live in [frontend/src/lib/api.ts](frontend/src/lib/api.ts):
- `gradeBatch(...)` → `POST /api/grade-batch`
- `generateRubric(...)` → `POST /api/generate-rubric`
- `reviseRubricLLM(...)` → `POST /api/revise-rubric-llm`
- `runEvaluation(...)` → `POST /api/evaluation/run`
- `runCalibration(...)` → `POST /api/evaluation/calibrate`

The user's Gemini API key can be sent via `X-API-Key` or `Authorization: Bearer` header; settings are persisted in `localStorage["grading_tool.api_settings"]`.

### 1.4 Cross-page state (localStorage)

| Key | Producer | Consumer |
|-----|----------|----------|
| `grading_questions` | Intake | Grading, Evaluation |
| `grading_rubrics` | Intake | Grading, Evaluation |
| `grading_results` | Grading | Evaluation (calibration round 1) |
| `grading_decisions` / `grading_edited_scores` / `grading_edited_reasoning` | Grading | Grading (persistence on refresh) |
| `grading_tool.api_settings` | api.ts | api.ts |

---

## 2. Backend (FastAPI)

### 2.1 Stack
- **FastAPI** + **Uvicorn** + **Pydantic v2**.
- Started with `uvicorn app.main:app --reload --port 8000`.
- CORS configured for `localhost:5173/5174/4173` and Vercel deployments.

### 2.2 Folder layout
```
app/
├── main.py                 # FastAPI bootstrap + CORS + router mounting
├── routes/
│   ├── health.py           # GET /api/health
│   ├── grading.py          # grading + rubric endpoints
│   ├── evaluation.py       # evaluation + calibration endpoints
│   └── runs.py             # demo run summaries
├── services/
│   └── grader_service.py   # orchestration: wraps the core library
└── schemas/
    └── api_models.py       # Pydantic request/response models
```

### 2.3 API endpoints

**Health**
- `GET /api/health` → `{"status":"ok"}` ([health.py](app/routes/health.py))

**Grading** ([app/routes/grading.py](app/routes/grading.py))
- `POST /api/grade` — legacy single submission (rule-based fallback).
- `POST /api/grade-batch` — **main endpoint** used by the frontend. Routes to the Gemini `RubricGrader` when a rubric + question text is supplied; falls back to a rule-based heuristic when not.
- `POST /api/generate-rubric` — LLM rubric generation for a list of questions.
- `POST /api/revise-rubric-llm` — LLM rubric revision driven by a `revision_focus` string.
- `POST /api/survey-submissions`, `POST /api/mistake-stats`, `POST /api/revise-rubric` — legacy rule-based endpoints.

**Evaluation** ([app/routes/evaluation.py](app/routes/evaluation.py))
- `GET /api/evaluation/health`
- `POST /api/evaluation/run` — single-pass AI-vs-professor comparison.
- `POST /api/evaluation/calibrate` — multi-round rubric calibration loop.

**Runs** ([app/routes/runs.py](app/routes/runs.py))
- `GET /api/runs` — hardcoded demo run summaries.

### 2.4 Service layer

[app/services/grader_service.py](app/services/grader_service.py) is the bridge between the HTTP layer and the core grading library. Key functions:
- `score_answer(...)` — rule-based fallback scorer.
- `grade_batch(submissions, api_key=None)` — routes each submission either to the Gemini `RubricGrader` or to the rule-based fallback.
- `generate_rubric(payload, api_key=None)` — wraps `RubricGenerator.generate()`.
- `revise_rubric_llm(payload, api_key=None)` — wraps `RubricGenerator.revise()`.
- `evaluate_with_ground_truth(payload)` — computes evaluation metrics + flagged cases.
- `calibrate_rubric_rounds(payload, api_key=None)` — drives the multi-round loop.
- `_build_revision_focus(...)` — builds the structured prompt sent to the LLM during calibration revisions.

### 2.5 Schemas

[app/schemas/api_models.py](app/schemas/api_models.py) defines all request/response Pydantic models: `GradeRequest`, `BatchGradeRequest/Response`, `RubricGenerationRequest/Response`, `RubricLLMReviseRequest/Response`, `EvaluationRequest/Response`, `CalibrationRequest/Response`, `CalibrationRoundResult`, etc.

### 2.6 How the frontend connects (recap)
- Frontend bundles requests in `lib/api.ts` and hits one of the routes above.
- The route validates with Pydantic, calls the matching `grader_service.*` function, and returns JSON.
- The service function delegates to **`src/grading_tool/`** for any LLM work.

---

## 3. LLM Grading Logic (the heart of the project)

> All LLM work goes through `src/grading_tool/`. The provider is **Google Gemini** via `google-generativeai`.
> Model defaults to `gemini-2.5-pro` (configurable via env var `GEMINI_MODEL`).

### 3.1 The Gemini client wrapper

[src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py)

```python
class GeminiClient:
    def generate_json(self, system_prompt: str, payload: dict) -> dict
```
Configured for **deterministic** decoding:
- `temperature=0.0`
- `top_p=1.0, top_k=1`
- `response_mime_type="application/json"`

Strips markdown fences if the LLM still wraps output. This determinism is what makes calibration **trustworthy** — re-running round 1 produces the same grades as the saved baseline.

---

### 3.2 Pipeline A — Generating a rubric

**File:** [src/grading_tool/grading/rubric_generator.py](src/grading_tool/grading/rubric_generator.py) (`RubricGenerator.generate`)

**Inputs:** `question_text`, `max_score`, optional `reference_solution`.

**System prompt:** "You are an expert instructor designing grading rubrics." When a `reference_solution` is provided, an extra block is appended instructing the LLM to:
1. Identify key solution components.
2. Map each rubric criterion to one or more components.
3. Describe full-, partial-, and no-credit explicitly in terms of those components.
4. Explicitly award 0 for blank or off-topic answers.

**Output JSON:**
```json
{
  "criteria": [{"name": ..., "description": ..., "max_points": ...}],
  "full_credit": "...",
  "partial_credit": "...",
  "low_credit": "...",
  "manual_review_trigger": "..."
}
```
Criterion points are **normalized** to sum to exactly `max_score`.

**How it's used:**
- **Frontend:** `QuestionIntakePage` → `generateRubric()` → `POST /api/generate-rubric`.
- **Backend:** `routes/grading.py` → `grader_service.generate_rubric` → `RubricGenerator.generate()` (one Gemini call per question, parallelized in the frontend).
- **Persistence:** result text is stored in `localStorage["grading_rubrics"][question_id]`.

---

### 3.3 Pipeline B — Revising a rubric

**File:** Same `RubricGenerator.revise(...)` in [rubric_generator.py](src/grading_tool/grading/rubric_generator.py).

**Inputs:** `question_text`, `current_rubric_text`, `revision_focus`, `max_score`, optional `reference_solution`.

**Behavior:**
- Same base system prompt + a "you are revising an existing rubric" preamble.
- Includes the `revision_focus` (free-form when the user types it on Intake, structured & bucketed when calibration drives it — see §3.6).
- Enforces that the output **differs** from the input (rejects exact matches and retries).

**Used in two places:**
1. **Frontend manual revision** — `QuestionIntakePage` button → `POST /api/revise-rubric-llm`.
2. **Calibration loop** — passed in as `revise_fn` to `run_calibration` (see §3.6).

---

### 3.4 Pipeline C — Grading submissions

This is the central pipeline. Three pieces work together:

#### 3.4.1 Prompt assembly — [src/grading_tool/grading/prompt_builder.py](src/grading_tool/grading/prompt_builder.py)
- `build_system_prompt(prompt_name, prompt_cfg)` reads [configs/prompts.yaml](configs/prompts.yaml) and selects a variant:
  - `prompt_v1`: strict rubric-only, no implicit reasoning, no reference solution.
  - `prompt_v2`: balanced; allows implicit reasoning; uses reference solution for alternative valid approaches.
- `build_payload(...)` packs the question text, student answer, rubric, reference solution, benchmark type, and an expected `response_schema` hint into a JSON payload.

#### 3.4.2 Grading engine — [src/grading_tool/grading/rubric_grader.py](src/grading_tool/grading/rubric_grader.py)
```python
class RubricGrader:
    def grade_question(student_id, question_id, benchmark_type, question_text,
                       rubric, student_answer, score_max, reference_solution=None)
```
Flow:
1. `build_payload(...)` → system prompt + JSON payload.
2. `GeminiClient.generate_json(...)` → raw LLM JSON.
3. `parse_grade_response(...)` → strongly-typed `QuestionGradeResult`.

#### 3.4.3 Response parsing — [src/grading_tool/grading/response_parser.py](src/grading_tool/grading/response_parser.py)
- Extracts `criterion_results` (per-criterion points + justification).
- **Clamps** each `awarded_points` to `[0, max_points]` and total score to `[0, score_max]` (safety net against LLM hallucinated scores).
- Extracts `confidence` (clamped to `[0,1]`), `feedback`, and a `review_required` flag.

#### 3.4.4 Batch orchestration — [src/grading_tool/grading/orchestrator.py](src/grading_tool/grading/orchestrator.py)
For CLI / benchmark runs: loads question, rubric, solution, and student-answer JSON files; flattens subparts (`q4` → `q4i`, `q4ii`, ...); iterates and calls `RubricGrader.grade_question` per submission; writes a run file under `data/outputs/runs/`.

#### 3.4.5 Frontend ↔ backend wiring for grading
- **Frontend:** `SubmissionGradingPage` → `gradeBatch()` → `POST /api/grade-batch`.
- **Backend:** `routes/grading.py` → `grader_service.grade_batch()` → for each submission with a rubric, calls `RubricGrader.grade_question()`; otherwise the rule-based `score_answer()` fallback.
- **Result shape:** `BatchGradeResponse` with `results[]` (score, criterion breakdown, feedback, confidence, review flag) plus a `review_queue`.

#### 3.4.6 CLI entry
```bash
python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path  data/outputs/runs/final_prompt_v3.json \
  --prompt_name  prompt_v3
```
(see [src/grading_tool/cli/grade.py](src/grading_tool/cli/grade.py))

---

### 3.5 Pipeline D — Evaluation (AI vs. Professor)

**Files:**
- Reporting: [src/grading_tool/evaluation/agreement.py](src/grading_tool/evaluation/agreement.py) — `evaluate_run(...)`.
- Metrics: [src/grading_tool/evaluation/metrics.py](src/grading_tool/evaluation/metrics.py).

**Metrics computed:**
- `mean_squared_error`, `mean_absolute_error`
- `exact_match_rate`
- `score_variance`, `error_variance`
- `within_threshold_rate(threshold=0.5)`
- `normalize_scores`, `pearson_corr`, `spearman_corr`
- Optional semantic metrics (`average_cosine_similarity`, `bertscore_f1`) when `sentence-transformers` / `bert-score` are installed.

**Flagged cases:** rows where `|ai_score − prof_score| > difference_threshold`, bucketed by direction (over- vs under-credit).

**Used by:**
- **Frontend (Evaluation page → Compare tab):** `runEvaluation()` → `POST /api/evaluation/run` → `grader_service.evaluate_with_ground_truth()`.
- **CLI:** `python -m src.grading_tool.cli.evaluate --run_path … --professor_grade_path …` ([cli/evaluate.py](src/grading_tool/cli/evaluate.py)).

---

### 3.6 Pipeline E — Calibration (multi-round rubric improvement)

This is the differentiating pipeline of the project. Documented in [CALIBRATION.md](CALIBRATION.md).

**File:** [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py) — `run_calibration(...)`.

**Loop (per round, up to `max_rounds`):**
1. **Grade** all submissions with the current rubric — `grade_fn(submissions, current_rubric)`.
2. **Evaluate** the grades against professor grades — `evaluate_fn(...)` returns metrics + `flagged_cases`.
3. **Revise** the rubric — `revise_fn(current_rubric, flagged_cases, metrics, round_index)`:
   - In production this calls `RubricGenerator.revise()` with a **structured revision focus** built by `grader_service._build_revision_focus()`.
   - The focus bucket-aggregates flagged cases by **direction × answer-length × score-band**, includes the average gap, count, and up to 3 concrete examples (with student-answer excerpts) per bucket. This grounds the LLM's revision in concrete evidence rather than vague "do better."
   - Fallback rule-based reviser exists for the case when no LLM is configured.
4. **Stop conditions:**
   - `target_mse` reached.
   - Improvement vs previous round `< min_improvement`.
   - `max_rounds` exhausted.
5. **Best-round tracking** — the rubric with the lowest MSE across all rounds is preserved as `best_rubric`, independent of where the loop stops.

**Determinism payoff:** Because Gemini is decoding deterministically, Round 1 of calibration reproduces the saved grading results bit-for-bit. Any MSE delta in subsequent rounds is attributable to the rubric edit, not LLM noise.

**Frontend wiring:**
- `EvaluationPage` → "Improve the Rubric" tab → `runCalibration()` → `POST /api/evaluation/calibrate`.
- Backend: `routes/evaluation.py` → `grader_service.calibrate_rubric_rounds(...)` → `run_calibration(...)`.
- Response: `CalibrationResponse` containing `rounds[]`, `best_round_index`, `best_mse`, `best_rubric`, `stopping_reason`. The frontend renders round-by-round cards with the best round highlighted.

**CLI entry:**
```bash
python scripts/run_calibration.py \
  --benchmark data/benchmarks/cs302_midterm1_fall2025 \
  --question_id q3 --max_rounds 5
```

---

### 3.7 End-to-end data flow (one diagram in prose)

```
Questions JSON ──► Intake page ──► /api/generate-rubric ──► RubricGenerator.generate (Gemini)
                                                                       │
                                                              localStorage[grading_rubrics]
                                                                       │
Submissions JSON ──► Grading page ──► /api/grade-batch ──► RubricGrader.grade_question (Gemini)
                                                                       │
                                                              localStorage[grading_results]
                                                                       │
Professor grades  ──► Evaluation page ──► /api/evaluation/run     ──► metrics + flagged cases
                                  └──►  /api/evaluation/calibrate ──► loop: grade → evaluate
                                                                            → revise (Gemini)
                                                                            → best-rubric tracking
```

---

## 4. Limitations & Future Improvements

> Compiled from [Summary-Changes.md](Summary-Changes.md), [Evaluation_Improvement_Plan.md](Evaluation_Improvement_Plan.md), README "Known gaps", and code TODOs.

### 4.1 Current limitations

1. **API single-shot `/api/grade` is rule-based.** The legacy endpoint uses a heuristic (`score_answer()`) — only `/api/grade-batch` routes through Gemini when a rubric is provided. README explicitly calls this out.
2. **Calibration stop condition is too lenient** ([calibration.py:90](src/grading_tool/evaluation/calibration.py)). Negative improvements (rounds that get *worse*) don't break the loop; we waste budget.
3. **Semantic metrics are off by default.** `include_semantic_metrics=True` from the frontend is accepted, but the backend returns `null` unless `sentence-transformers` / `bert-score` / `torch` are installed.
4. **Evaluation page requires pasting inputs** even when the data exists in `localStorage` (rubric, submissions). Bad UX.
5. **Calibration results aren't persisted.** Refreshing the page wipes the round-by-round audit trail (lives in React state only).
6. **Error analysis module is empty.** [src/grading_tool/evaluation/error_analysis.py](src/grading_tool/evaluation/error_analysis.py) is a 0-byte placeholder; flagged-case bucketing currently happens ad hoc inside `grader_service`.
7. **No streaming / fire-and-forget calibration.** A 5-round calibration is one long blocking HTTP call (3–5 minutes). No progress signal to the user.
8. **Single LLM provider.** Hard-coded to Gemini. Switching to Claude / GPT requires touching `GeminiClient` directly.
9. **Cost / rate-limit handling is minimal.** No retry-with-backoff, no token accounting, no parallelism throttling on the backend.
10. **No authentication.** Anyone with the URL can grade. The user pastes their own Gemini key in the UI, but the backend itself is open.

### 4.2 Future improvements

1. **Fix the stop condition** — break when `improvement < min_improvement` regardless of sign; never let calibration drift worse.
2. **Auto-load inputs on the Evaluation page** from localStorage (questions, rubrics, submissions, prior grading results). Drop the paste boxes.
3. **Stream calibration progress** — either Server-Sent Events / WebSocket, or a stepped wizard that does one round per request with human checkpoints between rounds.
4. **Persist calibration runs** to `localStorage["calibration_runs"]` or a backend endpoint, so users can revisit the audit trail.
5. **Flesh out `error_analysis.py`** — bucket disagreements by over/under × score-band × answer-length × criterion-tag, and surface bucket-level stats in the UI.
6. **Provider abstraction** — split `GeminiClient` behind an `LLMClient` protocol so Claude / GPT can drop in.
7. **Unify CLI and API grading paths** — make `/api/grade-batch` and the CLI both go through the same orchestrator, removing the rule-based fallback drift.
8. **Cost & telemetry dashboard** — token counts per call, total spend per calibration run, latency histogram.
9. **Authentication & multi-tenant storage** — at minimum a backend session so keys / runs aren't on the client.
10. **Active-learning calibration** — instead of one revision per round, propose N candidate rubrics, grade a held-out sample, and keep the best.
11. **Per-question rubric prompts.** Currently one prompt template per `prompt_name`; subject-aware (math vs. code vs. essay) prompts would likely raise agreement.
12. **A/B prompt comparison harness** — already partly enabled by deterministic decoding; needs a UI to flip between `prompt_v1` / `prompt_v2` / `prompt_v3` and diff the resulting MSEs.

---

## 5. Quick file map for live demo

| Concept | File |
|---------|------|
| Frontend router | [frontend/src/App.tsx](frontend/src/App.tsx) |
| Frontend API client | [frontend/src/lib/api.ts](frontend/src/lib/api.ts) |
| Backend bootstrap | [app/main.py](app/main.py) |
| Backend grading routes | [app/routes/grading.py](app/routes/grading.py) |
| Backend evaluation routes | [app/routes/evaluation.py](app/routes/evaluation.py) |
| Service orchestration | [app/services/grader_service.py](app/services/grader_service.py) |
| Gemini wrapper | [src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py) |
| Rubric gen / revise | [src/grading_tool/grading/rubric_generator.py](src/grading_tool/grading/rubric_generator.py) |
| Grading engine | [src/grading_tool/grading/rubric_grader.py](src/grading_tool/grading/rubric_grader.py) |
| Prompt builder | [src/grading_tool/grading/prompt_builder.py](src/grading_tool/grading/prompt_builder.py) |
| Response parser | [src/grading_tool/grading/response_parser.py](src/grading_tool/grading/response_parser.py) |
| Batch CLI orchestrator | [src/grading_tool/grading/orchestrator.py](src/grading_tool/grading/orchestrator.py) |
| Metrics | [src/grading_tool/evaluation/metrics.py](src/grading_tool/evaluation/metrics.py) |
| Calibration loop | [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py) |
| Prompt configs | [configs/prompts.yaml](configs/prompts.yaml) |

---

## 6. One-line takeaway for the audience

> *"We treat the LLM as a deterministic function and put it inside a measurement loop: generate the rubric, grade with it, score the grades against the professor, then let the LLM revise the rubric based on a structured diagnosis of where it disagreed. Every round is reproducible, so improvement is real, not luck."*
