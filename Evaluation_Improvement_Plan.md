# Evaluation & Calibration Improvement Plan

A prioritized plan for fixing the Evaluation page and the calibration loop. Each item has: current state, the problem, the proposed fix, and the reasoning. Items are grouped by phase. Do the phases in order; items inside a phase can be parallelized.

---

## Phase 1 — Make calibration actually work (urgent)

These items are gated on each other: items A.2 and A.3 only meaningfully change behavior once A.1 is in place. Do them in this order.

### A.1 — Replace the rule-based rubric reviser with an LLM reviser

**Current state.** `run_calibration()` in [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py) calls `revise_rubric()` from [src/grading_tool/grading/rubric_reviser.py](src/grading_tool/grading/rubric_reviser.py) at the end of every round. That function is *purely rule-based*: it inspects mistake patterns and appends "suggestion" notes to a wrapping dict (`{original_rubric: ..., revision_notes: [...]}`). The actual criteria, descriptions, and point bands inside the rubric never change.

**Problem.** Across N calibration rounds the rubric stays effectively the same. The grader produces the same scores. MSE stays flat (or moves randomly due to Gemini noise). Multi-round calibration is theatre — looks like it's doing work, isn't.

**Fix.**
1. Add an optional `revise_fn` parameter to `run_calibration()` with signature `(current_rubric, flagged_cases, metrics, round_index) -> {revised_rubric, revision_needed, justification, change_log}`.
2. In [app/services/grader_service.py](app/services/grader_service.py), `calibrate_rubric_rounds()` builds a closure that:
   - Converts the current rubric to its text representation.
   - Derives a `revision_focus` string from the flagged cases (count of AI-higher vs AI-lower, magnitudes, a few reasoning excerpts).
   - Calls `RubricGenerator.revise(question_text, current_rubric_text, revision_focus, max_score, reference_solution)`.
   - Formats the returned structured rubric back to text and returns it as `revised_rubric`.
3. Keep the rule-based reviser as a fallback when the LLM call raises.
4. Pass the closure into `run_calibration(..., revise_fn=llm_revise_fn)`.

**Why this way.**
- *Keep `calibration.py` decoupled from the LLM.* The loop stays grader/reviser-agnostic. Easy to swap models or fall back to rule-based.
- *Reuse `RubricGenerator.revise()`.* Already built, already tested for the user-facing Revise button. No new module needed.
- *Pass focus as a string built from evaluation evidence.* The LLM revises grounded in actual disagreements, not a vague "improve the rubric" instruction.
- *Fallback safety.* A flaky Gemini call shouldn't kill the entire calibration; falling back to rule-based at least preserves the structural shape downstream code expects.

---

### A.2 — Reuse the saved grading results as calibration round 1

**Current state.** Calibration round 1 calls `grade_fn(submissions, original_rubric)`, which re-runs Gemini grading on every submission. With `temperature=0` and identical rubric/question/answer, the output is byte-equivalent (or near so) to what's already saved in `localStorage["grading_results"]` from the user's prior run on Submission Grading.

**Problem.** Wastes one full Gemini grading round per calibration run. For 30 submissions at ~10 s/submission that's ~5 minutes of unnecessary latency and ~30 Gemini calls of unnecessary cost.

**Fix.** Two options:
1. **Backend-only:** add an optional `precomputed_grades: list[GradeResult]` to `CalibrationRequest`. If provided, `calibrate_rubric_rounds()` skips `grade_fn` for round 1 and uses these as the round-1 grade results. Rounds 2+ still grade with the new rubric.
2. **Frontend + backend:** EvaluationPage reads `grading_results` from localStorage, includes it in the calibration request. Backend honors it.

Option 2 is the right one because it composes with item B.

**Why this way.** Greedy decoding (`temperature=0, top_k=1`) means same input → same output. Re-grading is provably redundant for round 1. The grading from Submission Grading and round 1 of calibration are *literally the same computation*. Avoiding it is pure win — no behavior change, just less waiting.

---

### A.3 — Tighten the calibration stop condition

**Current state.** [calibration.py:90](src/grading_tool/evaluation/calibration.py) stops the loop only when `0 <= improvement < min_improvement`. If MSE *worsens* between rounds (improvement is negative), the loop keeps running.

**Problem.** If round 2's rubric is worse than round 1's (which can happen — LLM revisions are not monotonically improving), the loop barrels on for another 3 rounds, possibly producing a series of worse rubrics. The `best_rubric` tracking saves us at the end, but we waste time and Gemini calls on rounds we should have skipped.

**Fix.** Change the condition to:
```
if improvement < min_improvement:
    # covers both "marginal improvement" and "worse than last round"
    stopping_reason = ...
    break
```
Optionally, add a hard "worsening threshold": if MSE rises by more than X% from the best round so far, stop immediately.

**Why this way.** Trivial change with no downside. Once A.1 makes rubric revisions actually meaningful, stopping on worsening is the correct behavior — keep going only if you're learning.

---

## Phase 2 — Make the Evaluation page usable (high-ROI UX)

These items don't require Phase 1 to land first; they can be done in parallel. They are listed in priority order within the phase.

### B.1 — Auto-load from localStorage; eliminate paste boxes

**Current state.** EvaluationPage requires the user to paste three JSONs: submissions, professor grades, rubric text. None of this is loaded from the data the user already produced on Question Upload and Submission Grading pages.

**Problem.** The empty state of the page is 14 input fields. New users have no idea where to start. Existing users have to re-paste data they already entered elsewhere.

**Fix.** On mount, read:
- `localStorage["grading_questions"]` → populate a question-id dropdown and source `question_text` / `max_score`.
- `localStorage["grading_rubrics"]` → fill the rubric textarea for the selected question.
- `localStorage["grading_results"]` → use as the AI grades input (no paste needed).

Keep all textareas visible but pre-filled — the user can override if they want to test with different data.

The only field that genuinely requires fresh input is **professor grades**, because that's the ground truth this page doesn't already have.

**Why this way.** This is the single highest-ROI change in the entire plan: zero backend work, eliminates 3 of 4 paste boxes, makes the page's purpose immediately obvious ("upload professor grades to evaluate the rubric you just used"). It doesn't depend on Phase 1, so it can land first if convenient.

---

### B.2 — Plain-language metric captions

**Current state.** Result panel shows MSE, MAE, score variance, within-threshold rate as bare numbers.

**Problem.** Non-technical instructors don't intuit MSE. They read "0.84" and don't know if that's good or bad.

**Fix.** Under each metric card, render a single sentence interpretation:
- "Within ±0.5: 78% — *78% of AI scores are within ±0.5 of the professor's grade.*"
- "MSE: 0.84 — *on average, AI scores deviate from professor grades by about 0.92 points (squared).*"
- "MAE: 0.71 — *average absolute difference between AI and professor scores.*"

**Why this way.** Cheapest UX win in the plan (≤15 minutes). Numbers without interpretation are just decoration; numbers with one-line context become decision-grade information.

---

### B.3 — Collapse advanced knobs

**Current state.** Threshold, max_rounds, target_mse, min_improvement, include_semantic_metrics are all visible at top level.

**Problem.** Five tuning knobs on the main form drown out the primary action ("Run Evaluation"). The 80% case is "use sensible defaults."

**Fix.** Wrap them in an `<details>` element labeled "Advanced options", collapsed by default. Surface only the essentials at top level (question selector + professor-grades input + Run button).

**Why this way.** Progressive disclosure is standard UX practice. The knobs aren't deleted — they're hidden until needed. Power users still find them; new users see a clean form.

---

### B.4 — Split eval vs calibration into tabs

**Current state.** Both flows ("Run Evaluation" and "Run Calibration") share the same form with two buttons at the bottom.

**Problem.** Users don't know which button to click first or how the two relate. The shared form blurs the distinction between *measure the rubric* (eval) and *improve the rubric* (calibration).

**Fix.** Top-of-page tab strip:
- **Tab 1 — "Compare AI vs Professor"** (evaluation). Inputs: just professor grades. Output: metric cards + flagged-cases table. One button.
- **Tab 2 — "Improve the Rubric"** (calibration). Inputs: professor grades + advanced knobs (collapsed). One button. Output: round-by-round timeline.

Both tabs share the question selector and professor-grades input (state persists across tab switches).

**Why this way.** Clear mental model: *first evaluate, then optionally improve*. Matches the natural workflow. Also makes per-flow UI cleaner — each tab can have its own result rendering optimized for what that flow outputs.

---

## Phase 3 — Calibration depth (after Phase 1)

These items extend the calibration feature once it's actually working.

### C.1 — Fill `error_analysis.py` with bucketing

**Current state.** [src/grading_tool/evaluation/error_analysis.py](src/grading_tool/evaluation/error_analysis.py) is 0 bytes.

**Problem.** The LLM reviser (A.1) gets a flat list of flagged cases. It has to discover patterns itself from raw evidence. We can do better by pre-categorizing.

**Fix.** Implement a function `analyze_errors(flagged_cases) -> dict` that returns:
- `over_credit_count`, `over_credit_mean_diff`, `over_credit_examples` (AI > professor)
- `under_credit_count`, `under_credit_mean_diff`, `under_credit_examples` (AI < professor)
- `by_score_band`: `{"high (8-10)": {over: n, under: n}, "mid (5-7)": ..., "low (0-4)": ...}`
- `reasoning_length_bias`: do disagreements correlate with answer length?

Feed this object into the LLM reviser as targeted instructions ("you over-credit short answers" / "be stricter for high-score answers").

**Why this way.** LLMs respond much better to pre-digested, structured insights than to raw lists of cases. Bucketing turns "here are 20 disagreements, figure it out" into "you have a systematic over-credit problem on short answers — fix that." Multiplier on A.1's effectiveness without changing the LLM.

---

### C.2 — Persist calibration runs

**Current state.** Calibration responses live only in React state. Refresh the page and the audit trail is gone.

**Problem.** Instructors can't compare runs ("did the rubric improve more this time than last?"), can't review yesterday's best rubric, can't share a run with a colleague.

**Fix.** Two layers:
1. **Cheap:** write the full `CalibrationResponse` to `localStorage["calibration_runs"]` as an array, capped at last 20 runs.
2. **Durable:** add a backend endpoint `POST /api/calibration/runs` that stores runs server-side (small JSON in a sqlite or file). The UI gains a "Past runs" section listing previous calibrations with timestamps and best-MSE.

Do layer 1 first.

**Why this way.** localStorage is two `JSON.stringify` calls — minutes of work, no backend churn. It already unlocks the comparison use case for the single-user-on-one-machine path. Backend storage comes later when you have multiple users.

---

### C.3 — Round-by-round calibration UI

**Current state.** Calibration is fire-and-forget. User clicks button, waits 3–5 minutes, sees one big result blob.

**Problem.**
1. No visibility during the wait.
2. No human intervention point — if round 2 produces a bad rubric, the loop barrels on regardless.
3. The big-blob output is hard to scan; rounds blur together.

**Fix.** Architectural change:
1. Backend: add `POST /api/calibration/round` taking `{question_id, current_rubric, submissions, professor_grades, round_index}` and returning `{rubric_after, metrics, flagged_cases, change_log}`. Server is stateless; the current rubric is passed in each call.
2. Frontend: a vertical timeline UI. The first round renders instantly (uses cached `grading_results` per A.2). After each round, a card shows MSE delta, rubric diff, flagged cases. User chooses "Accept and continue" / "Edit rubric and continue" / "Stop here". Frontend triggers the next round.

**Why this way.**
- Solves the "where's the progress" problem from item 1c in the prior discussion.
- Solves the "no human feedback" problem from the same discussion.
- Stateless backend means no session management complexity.
- Each round's wait is ≤30 s instead of 3–5 minutes of nothing.

This is the biggest single UX upgrade for calibration but also the largest lift. Do it after Phase 1 and B.1–B.4 are stable.

---

## Phase 4 — Polish (whenever)

### D.1 — Move settings (backend URL + API key) to a Settings drawer

**Current state.** Backend URL and Gemini API key are top-level inputs on EvaluationPage.

**Problem.** Configuration values that change once per environment shouldn't live in the workspace.

**Fix.** Add a "⚙ Settings" icon in `TopNav` that opens a side drawer. Move both inputs there. Storage key (`grading_tool.api_settings`) is already used by [api.ts](frontend/src/lib/api.ts) — no logic change needed.

**Why this way.** Pure janitorial cleanup. Removes 2 inputs from EvaluationPage without breaking any flow.

---

## Recommended sequencing

| Day | Items |
|---|---|
| 1 | A.1 (LLM reviser) → A.2 (reuse round 1) → A.3 (stop condition) |
| 2 morning | B.1 (auto-load) |
| 2 afternoon | B.2 (captions) → B.3 (advanced collapse) → B.4 (tabs) |
| 3 | C.1 (error_analysis bucketing) |
| Later | C.2 (persist runs) → C.3 (round-by-round UI) → D.1 (settings drawer) |

**If you can only do one thing:** A.1.
**If you can only do two:** A.1 + B.1.
**If you can only do three:** A.1 + A.2 + B.1.

Phase 1 must precede Phase 3 items C.1 and C.3 conceptually (they depend on calibration actually changing the rubric). Everything else can be reshuffled.

---

## Notes

- This plan assumes the deterministic-decoding change in [src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py) (temperature=0, top_k=1) stays in place. Without it, the "reuse round 1 grading" optimization (A.2) breaks because round-1 grading would not match the saved results.
- The LLM-backed revise (A.1) increases Gemini cost per calibration run: one extra call per round (the reviser itself). For a 5-round run that's 5 additional calls beyond the grading calls. Worth it.
- The user-facing "Revise" button on QuestionIntakePage already uses `RubricGenerator.revise()`. A.1 makes calibration's reviser identical to that path. Consistency win.
