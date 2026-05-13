# Grading Tool — Change Summary

A running log of changes since the calibration redesign branch. Grouped by area, not strict chronology. File paths are relative to the repo root.

## 1. Backend

### Rubric generation (new)

- **`src/grading_tool/grading/rubric_generator.py`** (new). `RubricGenerator` class that calls Gemini to generate a structured rubric from a question + optional reference solution. Two methods:
  - `generate(question_text, max_score, reference_solution=None)` — produces a fresh rubric.
  - `revise(question_text, current_rubric_text, revision_focus, max_score, reference_solution=None)` — LLM-backed revision anchored to the current rubric and the reviewer's focus. System prompt explicitly forbids returning identical wording.
  - `format_rubric_as_text(rubric)` — flattens the structured rubric into the bullet-list text the rest of the app already understands.
  - `_normalize_rubric(...)` rescales criterion points so they sum exactly to `max_score`.

### New schemas

- **`app/schemas/api_models.py`**: added
  - `RubricGenerationQuestion`, `RubricGenerationRequest`, `GeneratedRubricItem`, `RubricGenerationResponse` (note: `solutions` field optional, so Option 1 — two-file question + solution input — is a drop-in upgrade later).
  - `RubricLLMReviseRequest`, `RubricLLMReviseResponse`.

### New service functions

- **`app/services/grader_service.py`**:
  - `generate_rubric(payload, api_key=None)` — iterates questions, merges optional solutions by `question_id`, isolates per-question failures.
  - `revise_rubric_llm(payload, api_key=None)` — single-question LLM revise.
  - **`grade_batch` change**: when a submission has no rubric (`not use_rubric`), the loop now short-circuits to a `GradeResult(score=0, max_score=0, review_required=True, review_reason="no_rubric", reasoning="No rubric found for this question. Cannot grade automatically.")`. Previously it fell through to the rule-based `score_answer` which hard-coded 5/10 + "Partial answer detected."

### New routes

- **`app/routes/grading.py`**:
  - `POST /api/generate-rubric` → `generate_rubric_endpoint`. Reads `X-API-Key` / `Bearer` like the grade-batch route.
  - `POST /api/revise-rubric-llm` → `revise_rubric_llm_endpoint`. Same auth pattern.

### Deterministic LLM output

- **`src/grading_tool/models/gemini_client.py`**: `generate_json(...)` now passes
  ```python
  generation_config={
      "temperature": 0.0, "top_p": 1.0, "top_k": 1,
      "response_mime_type": "application/json",
  }
  ```
  Greedy decoding → same prompt produces (near-)identical output across calls. Affects rubric generation, rubric revise, and grading.

---

## 2. Frontend — pages

### Files removed

- **`frontend/src/pages/RubricReviewPage.tsx`** — deleted. Was an orphaned legacy page; its content had been merged into `QuestionIntakePage` by commit `950eb4c` ("redesign entire frontend, merge question upload + rubric generate to one page only"). The `/rubric` route and the import in `App.tsx` were removed.

### `frontend/src/App.tsx`

- Removed `RubricReviewPage` import and the `/rubric` route. Page count now matches the four nav links (Home, Question Upload, Submission Grading, Evaluation).

### `frontend/src/pages/QuestionIntakePage.tsx`

- **Generate Rubric button** wired to backend. `handleGenerateAllRubrics` calls `POST /api/generate-rubric` *one request per question*, in parallel. Per-question fallback to a basic static template on error.
- **Visibility fix**: previously the button was hidden whenever `localStorage.grading_rubrics` had any entry, even if those entries were for a different question set. Now `globalStatus` flips to `'generated'` only when *every current question_id* has a saved rubric.
- **Single Generate button**: removed the duplicate button in the Rubric Review panel. Clicking Generate in the Question Preview panel scrolls down to Rubric Review (`scrollIntoView`).
- **Progress panel** appears in Rubric Review while generating: shows `done / total` count and a smooth time-based fill (see Progress bar section below). When complete, switches to a "✓ Rubric is ready" pill that auto-disappears after 2.5s, then exposes a "Continue to Submission Grading" link.
- **Revise (suggested mode)** now calls `POST /api/revise-rubric-llm` with the current rubric + reviewer focus. Button shows "Revising…" while in-flight. Fallback to static template only on API error.
- **CSV removed**: deleted `csvTemplate`, `splitCsvLine`, `parseCsv`, `IntakeMode` type, mode-switch UI. Upload accepts `.json` / `application/json` only.

### `frontend/src/pages/SubmissionGradingPage.tsx`

- **CSV removed**: deleted `sampleCsvInput`, `splitCsvLine`, `parseCsvSubmissions`, `SubmissionMode` type, mode-switch UI. Upload accepts `.json` only.
- **Real `max_score`** in the score cell: was hardcoded `/10` everywhere; now reads `Number(item.max_score ?? 10)` from each result. PDF export and JSON export use the same value.
- **"No rubric found" display**: when `review_reason === 'no_rubric'` and the row isn't being rejected, the score cell shows **`-/-`** (black) instead of a misleading `0/0` or `5/10`.
- **Stats and distribution** skip `no_rubric` rows so the mean isn't dragged down by ungradable submissions.
- **Question ID column** added between Student ID and Score. Reflected in the table, JSON export, and PDF export.
- **Decision + Action merged into one Status/Action column** (mirroring the Rubric Review table). The decision pill is stacked over Approve / Reject buttons in a vertical group. Table is back to 7 columns; CSS column widths in `index.css` updated so **Reasoning** is the widest (`width: auto`).
- **Edited reasoning** now persists across the page:
  - Read-only reasoning view shows `editedReasoning[rowKey] ?? item.reasoning` (used to always show the original).
  - An "edited" pill appears next to *View/Hide reasoning* when an edit exists.
  - `editedReasoning`, `editedScores`, `decisions`, and the full `data` are hydrated from localStorage on mount and persisted on every change. Keys: `grading_results`, `grading_decisions`, `grading_edited_reasoning`, `grading_edited_scores`.
- **"Go to Evaluation" buttons**: one in the page header (visible whenever results exist) and one in the Grade Distribution panel header next to Export buttons.
- **Export**:
  - **Export JSON** — unchanged in spirit, includes `question_id`, `max_score`, and edited score/reasoning.
  - **Export PDF** — was a `window.print()` call (showed the browser print dialog, didn't download a file). Now uses **jsPDF + jspdf-autotable** to produce a real `.pdf` file and trigger a direct download. Landscape A4, header with Mean/Min/Max/Needs-Review, autotable with sensible column widths.
- **Progress bar** while grading: a new info panel below the page header. Shows "Grading submissions…" with a percent label and a smooth fill driven by elapsed time (single batch call, no per-row signal available; see Progress section).

### `frontend/src/pages/EvaluationPage.tsx`

- Untouched in this round, but analyzed (see Evaluation analysis section below).

### `frontend/src/components/TopNav.tsx`

- No code change; navigation no longer references `/rubric` since the route was removed.

---

## 3. Frontend — shared

### `frontend/src/lib/api.ts`

- Added `generateRubric(payload, options?)` for `POST /api/generate-rubric`.
- Added `reviseRubricLLM(payload, options?)` for `POST /api/revise-rubric-llm`.
- Type definitions: `RubricGenerationResponse`, `RubricLLMReviseResponse`.
- Existing helpers (`gradeBatch`, `runEvaluation`, `runCalibration`, `loadApiSettings`, `saveApiSettings`) unchanged.

### `frontend/src/index.css`

- Fixed `results-table` column widths to match the new 7-column layout (Index → Student ID → Question ID → Score → Status → Reasoning → Status/Action). Removed a duplicate `nth-child(5)` rule that was fighting the canonical block. Reasoning column is `width: auto` so it absorbs remaining width.
- `.action-col` width raised from 108 px to 150 px to fit the merged decision pill + buttons stack. Alignment switched from right to center.

### `frontend/package.json`

- Added dependencies: `jspdf`, `jspdf-autotable` (for true PDF download).

---

## 4. Progress bar (rubric + grading)

Symptom we fixed: the rubric progress bar showed 0% for the whole wait, then snapped to 100% in a second. Reason: parallel fan-out of N Gemini calls finishes all near the same wall-clock time, so the real-progress counter doesn't tick during the wait.

Solution applied on both pages: a layered progress model. The bar shows `max(realProgress, timeBasedProgress)`:

- **Real**: `done / total` from per-question completion (rubric page). Still the floor.
- **Time-based trickle**: every 250 ms, advance toward 95% based on `elapsed / expectedMs`, where `expectedMs = max(8 s, total * 9 s)`. Snaps to 100% on completion.

Grading page has no per-row signal (single batch endpoint), so it uses pure time-based trickle capped at 95% until the response actually returns.

---

## 6. Storage keys (localStorage)

Everything the frontend persists, keyed by `http://localhost:5173` (or your prod origin):

| Key | Producer | Consumer | Notes |
|---|---|---|---|
| `grading_questions` | QuestionIntakePage | SubmissionGradingPage, EvaluationPage | The parsed question list. |
| `grading_rubrics` | QuestionIntakePage | SubmissionGradingPage | `Record<question_id, rubric_text>`. |
| `grading_results` | SubmissionGradingPage | SubmissionGradingPage (rehydration) | Full `BatchGradeResponse` from the last grading run. |
| `grading_decisions` | SubmissionGradingPage | SubmissionGradingPage | `Record<rowKey, 'pending' \| 'approved' \| 'rejected'>`. |
| `grading_edited_reasoning` | SubmissionGradingPage | SubmissionGradingPage | Per-row manual reasoning overrides. |
| `grading_edited_scores` | SubmissionGradingPage | SubmissionGradingPage | Per-row manual score overrides. |
| `grading_tool.api_settings` | (Settings UI) | api.ts | Override for backend base URL. |

EvaluationPage reads `grading_questions` only. It does **not yet** read the saved grading results or rubrics — paste-based inputs only.

---

## 7. How to run

Two terminals.

**Backend** (from project root):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
Requires `GEMINI_API_KEY` in `.env` at the project root.

**Frontend** (`frontend/` dir):
```bash
npm install     # one-time, after the jspdf addition
npm run dev
```
Default frontend at `http://localhost:5173`, backend at `http://localhost:8000`. CORS is already configured in `app/main.py` for the standard Vite dev ports.

---

## 8. Open items / follow-ups

- Evaluation page integration with saved localStorage (items 1 & 2 in §5).
- Optional: per-submission grading fan-out so the grading progress bar shows real progress instead of time-based estimate.
- Optional: cache grading results by `hash(question + rubric + answer)` for full reproducibility (greedy decoding helps but doesn't guarantee bit-exact output).
- Optional: percent-based Grade Distribution buckets so questions with non-10 `max_score` are bucketed correctly.
- Optional: solutions-as-second-input upgrade for rubric generation (Option 1 in the original three-way design). Backend schema already supports it; needs a second upload widget on QuestionIntakePage.
