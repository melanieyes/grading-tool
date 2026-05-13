from __future__ import annotations

from typing import Any, Callable

from src.grading_tool.grading.rubric_reviser import revise_rubric

GradeFn = Callable[[list[dict], Any], list[dict]]
EvaluateFn = Callable[[list[dict], list[dict], float, bool], dict]
# (current_rubric, flagged_cases, metrics, round_index) -> revision dict
# Returned dict must contain keys: revised_rubric, revision_needed, justification, change_log
ReviseFn = Callable[[Any, list[dict], dict, int], dict]


def run_calibration(
    *,
    question_id: str,
    original_rubric: Any,
    submissions: list[dict],
    professor_grades: list[dict],
    grade_fn: GradeFn,
    evaluate_fn: EvaluateFn,
    max_rounds: int = 5,
    difference_threshold: float = 0.5,
    target_mse: float | None = None,
    min_improvement: float = 0.01,
    include_semantic_metrics: bool = True,
    instructor_note: str | None = None,
    revise_fn: ReviseFn | None = None,
) -> dict:
    """
    Run rubric calibration for several rounds.

    This module only controls the loop.
    It does not know whether grading is rule-based, Gemini-based, or another model.
    """
    if max_rounds <= 0:
        raise ValueError("max_rounds must be greater than 0.")

    current_rubric = original_rubric
    rounds: list[dict] = []

    best_round_index = 1
    best_mse = float("inf")
    best_rubric = original_rubric

    previous_mse: float | None = None
    stopping_reason = "Reached max rounds."

    for round_index in range(1, max_rounds + 1):
        grade_results = grade_fn(submissions, current_rubric)

        evaluation = evaluate_fn(
            grade_results,
            professor_grades,
            difference_threshold,
            include_semantic_metrics,
        )

        metrics = evaluation.get("metrics", {})
        current_mse = float(metrics.get("mse", 0.0))

        if current_mse < best_mse:
            best_mse = current_mse
            best_round_index = round_index
            best_rubric = current_rubric

        flagged_cases = evaluation.get("flagged_cases", [])

        revision: dict | None = None
        if revise_fn is not None:
            try:
                revision = revise_fn(current_rubric, flagged_cases, metrics, round_index)
            except Exception:
                # LLM revise failed; fall through to rule-based reviser below so
                # the loop still produces some revision for this round.
                revision = None

        if revision is None:
            revision = revise_rubric(
                original_rubric=current_rubric,
                mistake_stats=None,
                flagged_cases=flagged_cases,
                instructor_note=instructor_note,
                round_index=round_index,
            )

        rounds.append(
            {
                "round_index": round_index,
                "rubric": current_rubric,
                "grade_results": grade_results,
                "evaluation": evaluation,
                "revision_note": revision.get("justification"),
            }
        )

        if target_mse is not None and current_mse <= target_mse:
            stopping_reason = f"Stopped because target MSE {target_mse} was reached."
            break

        if previous_mse is not None:
            improvement = previous_mse - current_mse

            if 0 <= improvement < min_improvement:
                stopping_reason = (
                    f"Stopped because MSE improvement {round(improvement, 4)} "
                    f"was below min_improvement {min_improvement}."
                )
                break

        if not revision.get("revision_needed", False):
            stopping_reason = "Stopped because no rubric revision was needed."
            break

        current_rubric = revision["revised_rubric"]
        previous_mse = current_mse

    return {
        "question_id": question_id,
        "max_rounds": max_rounds,
        "completed_rounds": len(rounds),
        "best_round_index": best_round_index,
        "best_mse": round(best_mse, 4) if best_mse != float("inf") else 0.0,
        "best_rubric": best_rubric,
        "rounds": rounds,
        "stopping_reason": stopping_reason,
    }