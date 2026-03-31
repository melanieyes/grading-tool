from __future__ import annotations

from src.grading_tool.schemas.grading import CriterionResult, QuestionGradeResult


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def parse_grade_response(
    raw: dict,
    student_id: str,
    question_id: str,
    benchmark_type: str,
    score_max: float,
) -> QuestionGradeResult:
    criterion_results = []
    total = 0.0

    for item in raw.get("criterion_results", []):
        criterion_id = str(item.get("criterion_id", "unknown_criterion"))
        max_points = _safe_float(item.get("max_points", 0.0), 0.0)
        awarded_points = _safe_float(item.get("awarded_points", 0.0), 0.0)

        # Prevent invalid scores like negative or above criterion max
        awarded_points = _clamp(awarded_points, 0.0, max_points)

        justification = str(item.get("justification", ""))

        cr = CriterionResult(
            criterion_id=criterion_id,
            awarded_points=awarded_points,
            max_points=max_points,
            justification=justification,
        )
        total += cr.awarded_points
        criterion_results.append(cr)

    # Final score should never exceed question max
    total = _clamp(total, 0.0, score_max)

    confidence = _safe_float(raw.get("confidence", 0.5), 0.5)
    confidence = _clamp(confidence, 0.0, 1.0)

    feedback = str(raw.get("feedback", ""))
    review_required = bool(raw.get("review_required", False))

    return QuestionGradeResult(
        student_id=student_id,
        question_id=question_id,
        benchmark_type=benchmark_type,
        score_awarded=total,
        score_max=score_max,
        criterion_results=criterion_results,
        feedback=feedback,
        confidence=confidence,
        review_required=review_required,
        raw_response=raw,
    )