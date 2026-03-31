from __future__ import annotations

from src.grading_tool.schemas.grading import CriterionResult, QuestionGradeResult


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
        cr = CriterionResult(
            criterion_id=str(item["criterion_id"]),
            awarded_points=float(item["awarded_points"]),
            max_points=float(item["max_points"]),
            justification=str(item["justification"]),
        )
        total += cr.awarded_points
        criterion_results.append(cr)

    return QuestionGradeResult(
        student_id=student_id,
        question_id=question_id,
        benchmark_type=benchmark_type,
        score_awarded=total,
        score_max=score_max,
        criterion_results=criterion_results,
        feedback=str(raw.get("feedback", "")),
        confidence=float(raw.get("confidence", 0.5)),
        review_required=bool(raw.get("review_required", False)),
        raw_response=raw,
    )