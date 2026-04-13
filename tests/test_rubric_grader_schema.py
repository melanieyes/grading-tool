from src.grading_tool.schemas.grading import CriterionResult, QuestionGradeResult


def test_grading_schema():
    cr = CriterionResult(
        criterion_id="q2b_1",
        awarded_points=1.0,
        max_points=1.0,
        justification="Correct label."
    )
    row = QuestionGradeResult(
        student_id="001",
        question_id="q2b",
        benchmark_type="true_false_with_explanation",
        score_awarded=1.0,
        score_max=8.0,
        criterion_results=[cr],
        feedback="Okay",
        confidence=0.9,
        review_required=False,
    )
    assert row.question_id == "q2b"