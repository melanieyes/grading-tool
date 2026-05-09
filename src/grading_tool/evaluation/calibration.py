from __future__ import annotations

from typing import Any, Callable

from src.grading_tool.grading.mistake_analyzer import analyze_flagged_cases
from src.grading_tool.grading.rubric_reviser import revise_rubric

GradeFn = Callable[[list[dict], Any], list[dict]]
EvaluateFn = Callable[[list[dict], list[dict], float, float, bool], dict]


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
    normalized_difference_threshold: float = 0.10,
    target_mse: float | None = None,
    min_improvement: float = 0.01,
    include_semantic_metrics: bool = True,
    instructor_note: str | None = None,
) -> dict:
    """
    Run rubric calibration for several rounds.

    This module only controls the loop.
    It does not know whether grading is rule-based, Gemini-based, or another model.
    """
    if max_rounds <= 0:
        raise ValueError("max_rounds must be greater than 0.")

    # Drop submissions with no matching professor grade so grade_fn never
    # wastes LLM calls on students that evaluation would silently skip.
    prof_keys = {
        (g.get("student_id"), g.get("question_id", question_id))
        for g in professor_grades
    }
    submissions = [
        s for s in submissions
        if (s.get("student_id"), s.get("question_id", question_id)) in prof_keys
    ]

    current_rubric = original_rubric
    rounds: list[dict] = []

    best_round_index = 1
    best_mse = float("inf")
    best_rubric = original_rubric

    previous_mse: float | None = None
    stopping_reason = "Reached max rounds."

    for round_index in range(1, max_rounds + 1):
        print(f"[calibration] round {round_index}/{max_rounds} — grading {len(submissions)} submission(s)...", flush=True)
        grade_results = grade_fn(submissions, current_rubric)
        print(f"[calibration] round {round_index}/{max_rounds} — evaluating...", flush=True)

        evaluation = evaluate_fn(
            grade_results,
            professor_grades,
            difference_threshold,
            normalized_difference_threshold,
            include_semantic_metrics,
        )

        metrics = evaluation.get("metrics", {})
        current_mse = float(metrics.get("mse", 0.0))
        print(f"[calibration] round {round_index}/{max_rounds} — MSE={current_mse:.4f}", flush=True)

        if current_mse < best_mse:
            best_mse = current_mse
            best_round_index = round_index
            best_rubric = current_rubric

        flagged_cases = evaluation.get("flagged_cases", [])
        normalized_flagged_cases = evaluation.get("normalized_flagged_cases") or flagged_cases

        mistake_stats = analyze_flagged_cases(normalized_flagged_cases)

        revision = revise_rubric(
            original_rubric=current_rubric,
            mistake_stats=mistake_stats,
            flagged_cases=normalized_flagged_cases,
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