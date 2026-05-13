# Calibration

End-to-end record of how rubric calibration works in this project, where it came from, what changed, and what's next.

---

## 1. Goal

Calibration adjusts an AI grading rubric over multiple rounds so that AI scores match a professor's scores **across an entire class**, not just on average.

Concretely, the goal is to design a rubric that:

- Gives **proportional partial credit** to students who are close to the reference solution — they have some correct keywords, partial steps, or the right idea even if incomplete (the "70%" case).
- Awards **0** to students who are blank, off-topic, or write something contradicting the solution (the "30%" case).
- Reduces the squared error between AI grades and professor grades (MSE) round over round.
- Produces a **justified** rubric — the user should be able to read why each round changed criteria the way it did.

The success signal is two-fold:

1. **MSE decreases** between rounds.
2. **The rubric meaningfully changes** — criteria reference specific solution components, partial-credit guidance is concrete, and blank/off-topic handling is explicit.

---

## 2. Current state

### Pipeline

| Layer | File | Responsibility |
|---|---|---|
| UI trigger | [frontend/src/pages/EvaluationPage.tsx](frontend/src/pages/EvaluationPage.tsx) `handleRunCalibration()` | Reads selected question, saved rubric, saved submissions, professor grades. Posts to backend. |
| Frontend API client | [frontend/src/lib/api.ts](frontend/src/lib/api.ts) `runCalibration()` | Fires `POST /api/evaluation/calibrate`. |
| Route | [app/routes/evaluation.py](app/routes/evaluation.py) | Forwards to service. |
| Service orchestration | [app/services/grader_service.py](app/services/grader_service.py) `calibrate_rubric_rounds()` | Builds `grade_fn` and `llm_revise_fn` closures, hands them to the loop. |
| Loop | [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py) `run_calibration()` | Round 1..N: grade → evaluate → revise → check stop. Tracks best-MSE round. |
| Grading per round | [src/grading_tool/grading/rubric_grader.py](src/grading_tool/grading/rubric_grader.py) `RubricGrader.grade_question()` | One Gemini call per submission with the current rubric. |
| Evaluation | [src/grading_tool/evaluation/metrics.py](src/grading_tool/evaluation/metrics.py) | MSE / MAE / variance / within-threshold rate. |
| LLM reviser | [src/grading_tool/grading/rubric_generator.py](src/grading_tool/grading/rubric_generator.py) `RubricGenerator.revise()` | One Gemini call to revise the rubric using the bucketed focus + answer content. |
| Focus builder | [app/services/grader_service.py](app/services/grader_service.py) `_build_revision_focus()` | Aggregates flagged cases into a structured prompt: direction, length bucket, score band, concrete answer excerpts. |

### What each round contains

1. Grade all submissions with the current rubric. (N Gemini calls.)
2. Compute MSE / MAE / flagged cases vs professor grades.
3. Build a **structured revision focus**: over- vs under-credit counts and averages, bucket breakdown (direction × answer-length × AI score band), up to three concrete examples with the **actual student answer excerpt** and the AI reasoning + professor comment.
4. Call the LLM reviser with the focus + current rubric + question + reference solution. If a solution is provided, the system prompt adds explicit instructions to enumerate solution components and map each criterion to one or more of them.
5. Stop if: target MSE reached, MSE improvement below `min_improvement`, or `revision_needed=False` (no flagged cases).
6. Best round (lowest MSE) is preserved as the winner regardless of where the loop ends.

### Determinism

Gemini is called with `temperature=0, top_p=1, top_k=1, response_mime_type="application/json"` in [gemini_client.py](src/grading_tool/models/gemini_client.py). Same input → same output (near-bit-exact). This makes round-1 grading match the saved grading results from Submission Grading and lets the loop's MSE deltas reflect rubric changes, not sampling noise.

### Fallback

If the LLM reviser raises, the loop transparently falls back to the rule-based reviser in [rubric_reviser.py](src/grading_tool/grading/rubric_reviser.py). One flaky call doesn't kill a multi-round run.

---

## 3. Previous (not-so-good) state

### State at the start of this work

- Calibration ran the multi-round loop but **the rubric never actually changed**. The reviser was rule-based: it inspected mistake patterns and appended notes like `{original_rubric: …, revision_notes: […]}` without modifying any criteria.
- Round-by-round MSE was effectively flat or moved randomly due to Gemini sampling noise (no deterministic decoding at the time).
- The Evaluation page was a 14-field paste-only form with no link to the rubrics, grading results, or submissions stored from prior pages.
- The reviser had no access to actual student answer content. Even when LLM revising was prototyped, the prompt only saw aggregate counts and short AI reasoning excerpts.
- No bucketing — "5 over-credit cases" was all the reviser knew, not "5 over-credit cases on short answers in the low-score band."
- The reference solution was passed to the grader but **not threaded into the revise prompt**, so it functioned as background context the LLM mostly ignored.
- Stopping rule fired only on `0 ≤ improvement < min_improvement`. Worsening rounds did not stop the loop.

### Observable symptom that motivated the rewrite

A 3-round run on a 28-point question (where the professor gave 0 to two students with blank/off-topic answers and the AI gave 6 to each):

```
Round 1: MSE 36.0
Round 2: MSE 36.0
Stopped: MSE improvement 0.0 was below min_improvement 0.01.
```

Round 2's rubric *text* changed slightly. The *scores* didn't. Reason: the reviser had nothing concrete to react to and no instruction to anchor partial credit on the solution.

---

## 4. What improved to reach the current state

In dependency order:

### 4.1 LLM reviser replaces rule-based reviser

- **Where:** [src/grading_tool/evaluation/calibration.py](src/grading_tool/evaluation/calibration.py) — added an optional `revise_fn` parameter to `run_calibration()`. Falls back to rule-based on exception.
- **Wired in:** [app/services/grader_service.py](app/services/grader_service.py) `calibrate_rubric_rounds()` builds an `llm_revise_fn` closure that calls `RubricGenerator.revise()` ([src/grading_tool/grading/rubric_generator.py](src/grading_tool/grading/rubric_generator.py)).
- **Why:** the rule-based reviser literally couldn't change criteria. Every other improvement depends on this one.

### 4.2 Deterministic decoding

- **Where:** [src/grading_tool/models/gemini_client.py](src/grading_tool/models/gemini_client.py) `GeminiClient.generate_json()`.
- **Change:** `generation_config={"temperature": 0.0, "top_p": 1.0, "top_k": 1, "response_mime_type": "application/json"}`.
- **Why:** without this, identical rubric input produces different scores between calls, so MSE noise drowns out real rubric improvements. Also makes round 1 of calibration equivalent to the saved Submission Grading results.

### 4.3 Answer content fed to the reviser

- **Where:** `_build_revision_focus()` in [app/services/grader_service.py](app/services/grader_service.py). New `submissions` parameter; per flagged case the function looks up the actual student answer text by `student_id` and includes a 240-char excerpt in the example block.
- **Why:** the LLM cannot write "blank or off-topic answers → 0" if it never sees a blank or off-topic answer. Concrete evidence drives concrete criteria.

### 4.4 Bucketed disagreements

- **Where:** same function, plus helpers `_bucket_answer_length()` and `_bucket_score()`.
- **Change:** flagged cases are clustered by direction × answer-length × AI score band. The prompt now contains lines like `over-credit on short answers in the low score band: 3 case(s), avg gap 6.0 pts.`
- **Why:** "be stricter" is generic; "be stricter for short answers in the low score band" is actionable. The LLM writes targeted criteria when it sees targeted evidence.

### 4.5 Solution-anchored partial credit

- **Where:** [src/grading_tool/grading/rubric_generator.py](src/grading_tool/grading/rubric_generator.py). Split `REVISE_SYSTEM_PROMPT` into `REVISE_SYSTEM_PROMPT_BASE` plus an optional `REVISE_WITH_SOLUTION_INSTRUCTIONS` appended at runtime by `RubricGenerator.revise()` when a non-empty `reference_solution` is supplied.
- **What the addendum tells the LLM:** identify key concepts/steps/keywords from the solution → map each rubric criterion to one or more components → describe full/partial/no-credit answers *in terms of those components* → blank/off-topic answers receive 0 → award proportional partial credit when components are present.
- **Why:** this is the contract that implements the "70% close → partial credit, 30% blank → 0" goal. Without it, the reviser writes generic "be stricter" / "be more lenient" rubrics that don't enumerate what to look for in an answer.

### 4.6 EvaluationPage UX overhaul

Documented separately in [Summary.md](Summary.md), but relevant because it's what makes calibration usable:

- Question dropdown sourced from `localStorage["grading_questions"]`.
- Saved rubric pre-loaded into the override textarea (with sync-on-question-change so the box is never empty when it shouldn't be).
- Saved AI grades (`grading_results`) and submissions (`grading_submissions`) consumed automatically — no paste required.
- Tab split: **Evaluation** (compare AI vs professor, no new grading) and **Calibration** (multi-round, requires submissions for re-grading).
- Status pills show prerequisites (`✓ N AI grades loaded`, `✓ Rubric loaded`).
- Plain-language metric captions under each card.
- Advanced knobs collapsed by default; backend URL + API key folded into the same disclosure.
- Nested professor-grades JSON parsing — supports both flat shape and `[{student_id, grades:[…]}]` shape, with either `score_max` or `max_score` as the max field name.
- Filter accepts either `question_id` or `original_question_id` so per-exam ids like `final_q3` match canonical `q3` rubrics.

---

## 5. Future improvements

Roughly in priority order. Items that depend on others are noted.

### 5.1 Soften the stop condition

[calibration.py](src/grading_tool/evaluation/calibration.py) currently stops when `0 ≤ improvement < min_improvement`. A worsening round doesn't stop the loop, and a single zero-improvement round terminates immediately even if rounds 3+ would have helped. Two cheap options:

- Require **two consecutive** non-improving rounds before stopping.
- Keep going as long as the **rubric text actually changed**, even if MSE didn't.

Effort: ~5 minutes. Useful when item 4.3 / 4.4 / 4.5 don't yet produce a different rubric on the first revise attempt.

### 5.2 Show non-flagged cases to the reviser

The reviser currently sees only disagreements. A few examples of agreement — "AI 6 vs Prof 6 on this medium-length answer with one keyword" — would prevent the LLM from over-tightening criteria that are already working. Effort: ~30 minutes, same function as item 4.3.

### 5.3 Reuse the saved grading results as round 1

[grading_results](frontend/src/pages/SubmissionGradingPage.tsx) is byte-equivalent to round 1 of calibration (same rubric, same answers, deterministic decoding). Backend could accept an optional `precomputed_grades` field on `CalibrationRequest` and skip `grade_fn` for round 1. Cuts one full round of Gemini latency + cost per calibration run. Effort: ~30 minutes.

### 5.4 Persist calibration runs

Currently the result lives only in React state. Refresh the page and the audit trail is gone. Two layers:

- Cheap: write `CalibrationResponse` to `localStorage["calibration_runs"]`, capped to last 20.
- Durable: a small backend endpoint that stores runs on disk.

Effort: ~1 hour for the cheap version.

### 5.5 Round-by-round interactive UI

Convert calibration from one big request to a stepped dialog. New endpoint `POST /api/calibration/round` taking `{current_rubric, submissions, professor_grades, round_index}` and returning that single round's result. Frontend renders a vertical timeline of round cards; after each card the user clicks **Accept and continue** / **Edit rubric and continue** / **Stop**. Solves three problems simultaneously: no progress feedback during the long wait; no human-in-the-loop checkpoint; result blob is too dense to scan.

Effort: ~half a day. Biggest single UX upgrade after the items already shipped.

### 5.6 Rubric diff between rounds in the UI

Show side-by-side rubric diffs so it's visually obvious what changed round-to-round. Couples with the change-log already recorded on each round (currently only the first line of `revision_note` is shown). Effort: ~30 minutes.

### 5.7 Fill `error_analysis.py`

[src/grading_tool/evaluation/error_analysis.py](src/grading_tool/evaluation/error_analysis.py) is currently empty. The bucketing in `_build_revision_focus()` lives in the service layer; lift it into this module as a reusable `analyze_errors(flagged_cases, submissions)` function. Adds: bucketing by (a) over/under, (b) score band, (c) answer length, (d) reasoning-length bias. Surfaces buckets in the EvaluationPage UI too, not just in the LLM prompt.

Effort: ~2 hours, including UI.

### 5.8 Per-component scoring

Once the reviser produces rubrics that enumerate solution components (item 4.5), the grader could grade *per component* — output a small JSON like `{component_A: 4, component_B: 0, component_C: 2}` — and the final score is the sum. Benefits: instructors can see exactly where credit came from; partial-credit decisions are auditable; the rubric and the grading output speak the same language.

Effort: half a day. Requires changes to `RubricGrader.grade_question()` ([rubric_grader.py](src/grading_tool/grading/rubric_grader.py)) and the response schema. Largest "what comes after the current improvements" item.

### 5.9 Per-criterion error breakdown

If 5.8 lands, the bucketing in `_build_revision_focus()` can additionally group disagreements by criterion ("over-credit on component_A, under-credit on component_C"). The reviser then knows exactly which criterion to tighten or loosen. Effort: ~1 hour, dependent on 5.8.

### 5.10 Settings drawer

Move backend URL + Gemini API key out of the EvaluationPage Advanced disclosure into a global "⚙ Settings" drawer accessible from TopNav. Pure janitorial — they're configured once per environment, not per task. Effort: ~30 minutes.

---

## 6. Open questions

These aren't blockers but are worth deciding before scaling calibration up.

- **Bias amplification.** With temperature=0 and multi-round revising, the LLM might keep nudging the rubric toward the *grading style* of the particular professor in the ground truth set, not toward "correct grading." If the professor has a systematic bias (e.g. over-penalizing long answers), 5 rounds of calibration will encode that bias into the rubric. Mitigation: cap rounds at 3, require human review before adopting the final rubric, or use multiple professor graders as ground truth.
- **Question heterogeneity.** Current calibration runs per-question. For a 10-question exam, that's 10 calibration runs. The "Improve the Rubric" tab disables the "All questions" option for exactly this reason. A future version could batch all questions into one orchestration so the UI still feels like one operation.
- **Cost.** Each calibration round is `N_submissions + 1` Gemini calls (N for grading + 1 for revising). A 5-round run on 30 submissions is 155 Gemini calls. Greedy decoding doesn't help — token volume is unchanged. Worth tracking via the response usage field if cost ever becomes an issue.

---

## 7. Glossary

- **Round** — one iteration of grade → evaluate → revise.
- **MSE** — mean squared error between AI scores and professor scores.
- **Flagged case** — a (student, question) pair where `|AI − professor| > difference_threshold`.
- **Over-credit / Under-credit** — flagged case where AI > professor / AI < professor.
- **Bucket** — a (direction, length, score-band) triple used to group flagged cases for the reviser.
- **Revision focus** — the structured string passed to the LLM reviser describing what to change and why.
- **Reference solution** — instructor-provided correct answer. When supplied, the reviser is instructed to anchor partial credit on its components.
- **Best round** — the round (1..N) with the lowest MSE. Returned as `best_rubric` regardless of where the loop stopped.
