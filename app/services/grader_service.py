from collections import Counter, defaultdict
from statistics import mean, variance
from typing import Dict, List, Tuple

from app.schemas.api_models import (
    BatchGradeResponse,
    CalibrationRequest,
    CalibrationResponse,
    CalibrationRoundResult,
    EvaluationMetrics,
    EvaluationRequest,
    EvaluationResponse,
    GradeRequest,
    GradeResult,
    MistakeCluster,
    MistakeStatsRequest,
    MistakeStatsResponse,
    ProfessorGradeInput,
    ReviewQueueItem,
    RubricChangeLogItem,
    RubricRevisionRequest,
    RubricRevisionResponse,
    ScoreComparisonItem,
    SurveyBatchRequest,
    SurveyBatchResponse,
    SurveyCommentResult,
)


def score_answer(student_id: str, answer: str, question_id: str = "Q1") -> GradeResult:
    """
    Temporary rule-based scorer.

    Later, this function should call:
    src/grading_tool/grading/orchestrator.py
    """
    text = answer.lower()

    score = 5.0
    confidence = 0.65
    reasoning = "Partial answer detected."
    review_required = False
    review_reason = ""

    if "deadlock" in text:
        score += 2

    if "resource" in text or "circular wait" in text:
        score += 2

    if "prevent" in text or "ordering" in text:
        score += 1

    score = min(score, 10.0)

    if len(text.split()) < 8:
        confidence = 0.52
        review_required = True
        review_reason = "Answer too short"

    if score >= 9:
        confidence = 0.90
        reasoning = "Strong answer with correct concepts and prevention strategy."
    elif score >= 7:
        confidence = 0.78
        reasoning = "Good answer but missing some detail."
        review_required = True
        review_reason = "Borderline score"
    else:
        confidence = 0.60
        review_required = True
        review_reason = "Low score"

    return GradeResult(
        student_id=student_id,
        question_id=question_id,
        score=score,
        max_score=10,
        confidence=confidence,
        review_required=review_required,
        review_reason=review_reason,
        reasoning=reasoning,
    )


def grade_batch(submissions: List[GradeRequest]) -> BatchGradeResponse:
    results = [
        score_answer(
            student_id=item.student_id,
            answer=item.answer,
            question_id=item.question_id,
        )
        for item in submissions
    ]

    review_queue = [
        ReviewQueueItem(
            student_id=result.student_id,
            question_id=result.question_id,
            score=result.score,
            confidence=result.confidence,
            reason=result.review_reason,
        )
        for result in results
        if result.review_required
    ]

    average_score = round(mean([result.score for result in results]), 2) if results else 0.0

    return BatchGradeResponse(
        count=len(results),
        average_score=average_score,
        review_count=len(review_queue),
        review_queue=review_queue,
        results=results,
    )


# ---------------------------------------------------------------------
# First-round survey: comments only, no exact grade
# ---------------------------------------------------------------------


def _infer_mistake_tags(answer: str) -> List[str]:
    text = answer.lower()
    tags: List[str] = []

    if len(text.split()) < 8:
        tags.append("too_short")

    if "deadlock" not in text:
        tags.append("missing_core_concept")

    if "resource" not in text and "circular wait" not in text:
        tags.append("missing_condition_or_mechanism")

    if "prevent" not in text and "ordering" not in text:
        tags.append("missing_solution_strategy")

    if not tags:
        tags.append("mostly_correct")

    return tags


def survey_submissions(payload: SurveyBatchRequest) -> SurveyBatchResponse:
    """
    First-round review.

    Important: this does NOT return exact grades.
    It only gives comments and mistake tags.
    """
    results: List[SurveyCommentResult] = []

    for submission in payload.submissions:
        tags = _infer_mistake_tags(submission.answer)

        strengths: List[str] = []
        weaknesses: List[str] = []

        if "mostly_correct" in tags:
            strengths.append("The answer identifies the main concept and includes relevant supporting details.")
        else:
            strengths.append("The answer shows some attempt to address the question.")

        if "too_short" in tags:
            weaknesses.append("The answer is too short to verify the student's reasoning.")
        if "missing_core_concept" in tags:
            weaknesses.append("The answer does not clearly identify the core concept.")
        if "missing_condition_or_mechanism" in tags:
            weaknesses.append("The answer does not explain the relevant condition or mechanism.")
        if "missing_solution_strategy" in tags:
            weaknesses.append("The answer does not provide a clear solution or prevention strategy.")

        comment = " ".join(strengths + weaknesses)

        results.append(
            SurveyCommentResult(
                student_id=submission.student_id,
                question_id=payload.question_id or submission.question_id,
                strengths=strengths,
                weaknesses=weaknesses,
                mistake_tags=tags,
                comment=comment,
                review_required="mostly_correct" not in tags,
            )
        )

    return SurveyBatchResponse(
        question_id=payload.question_id,
        count=len(results),
        results=results,
    )


# ---------------------------------------------------------------------
# Common mistake statistics
# ---------------------------------------------------------------------


def analyze_mistakes(payload: MistakeStatsRequest) -> MistakeStatsResponse:
    total = len(payload.survey_results)

    tag_counter: Counter[str] = Counter()
    affected_students: Dict[str, List[str]] = defaultdict(list)

    for item in payload.survey_results:
        for tag in item.mistake_tags:
            tag_counter[tag] += 1
            affected_students[tag].append(item.student_id)

    common_mistakes = [
        MistakeCluster(
            tag=tag,
            count=count,
            percentage=round(count / total, 4) if total else 0.0,
            affected_students=affected_students[tag],
            description=_describe_mistake_tag(tag),
        )
        for tag, count in tag_counter.most_common()
        if tag != "mostly_correct"
    ]

    return MistakeStatsResponse(
        question_id=payload.question_id,
        total_submissions=total,
        common_mistakes=common_mistakes,
    )


def _describe_mistake_tag(tag: str) -> str:
    descriptions = {
        "too_short": "The submission is too short to evaluate reasoning reliably.",
        "missing_core_concept": "The submission does not identify the main concept expected by the question.",
        "missing_condition_or_mechanism": "The submission misses an important condition, mechanism, or causal explanation.",
        "missing_solution_strategy": "The submission does not explain how to solve, prevent, or address the issue.",
    }
    return descriptions.get(tag, "Uncategorized mistake pattern.")


# ---------------------------------------------------------------------
# Rubric revision
# ---------------------------------------------------------------------


def revise_rubric(payload: RubricRevisionRequest) -> RubricRevisionResponse:
    """
    Temporary deterministic rubric revision.

    Later, this should call:
    src/grading_tool/grading/rubric_reviser.py
    """
    mistake_stats = payload.mistake_stats
    revision_needed = bool(mistake_stats and mistake_stats.common_mistakes)

    if not revision_needed:
        return RubricRevisionResponse(
            question_id=payload.question_id,
            revision_needed=False,
            revised_rubric=payload.original_rubric,
            change_log=[],
            justification="No major recurring mistake pattern was detected, so the rubric is kept unchanged.",
        )

    top_mistakes = mistake_stats.common_mistakes[:3]
    change_log = [
        RubricChangeLogItem(
            old=None,
            new=f"Add explicit partial-credit guidance for: {mistake.tag}",
            justification=(
                f"{mistake.count} submissions show this pattern "
                f"({round(mistake.percentage * 100, 2)}%)."
            ),
        )
        for mistake in top_mistakes
    ]

    revised_rubric = {
        "original_rubric": payload.original_rubric,
        "revision_notes": [
            {
                "mistake_tag": mistake.tag,
                "suggestion": f"Clarify how to award partial credit when the answer has: {mistake.description}",
                "affected_students": mistake.affected_students,
            }
            for mistake in top_mistakes
        ],
    }

    return RubricRevisionResponse(
        question_id=payload.question_id,
        revision_needed=True,
        revised_rubric=revised_rubric,
        change_log=change_log,
        justification=(
            "The rubric should be revised because multiple submissions share recurring mistakes "
            "that may require explicit partial-credit rules."
        ),
    )


# ---------------------------------------------------------------------
# Ground-truth evaluation
# ---------------------------------------------------------------------


def evaluate_with_ground_truth(payload: EvaluationRequest) -> EvaluationResponse:
    professor_lookup: Dict[Tuple[str, str], ProfessorGradeInput] = {
        (item.student_id, item.question_id): item for item in payload.professor_grades
    }

    comparisons: List[ScoreComparisonItem] = []

    for ai_result in payload.ai_results:
        key = (ai_result.student_id, ai_result.question_id)
        professor_grade = professor_lookup.get(key)

        if professor_grade is None:
            continue

        difference = ai_result.score - professor_grade.score
        abs_difference = abs(difference)

        comparisons.append(
            ScoreComparisonItem(
                student_id=ai_result.student_id,
                question_id=ai_result.question_id,
                ai_score=ai_result.score,
                professor_score=professor_grade.score,
                difference=round(difference, 4),
                abs_difference=round(abs_difference, 4),
                flagged=abs_difference > payload.difference_threshold,
                ai_reasoning=ai_result.reasoning,
                professor_comment=professor_grade.comment,
            )
        )

    metrics = _compute_evaluation_metrics(comparisons, payload.difference_threshold)
    flagged_cases = [item for item in comparisons if item.flagged]

    return EvaluationResponse(
        count=len(comparisons),
        metrics=metrics,
        flagged_count=len(flagged_cases),
        flagged_cases=flagged_cases,
        comparisons=comparisons,
    )


def _compute_evaluation_metrics(
    comparisons: List[ScoreComparisonItem],
    threshold: float,
) -> EvaluationMetrics:
    if not comparisons:
        return EvaluationMetrics(
            mse=0.0,
            mae=0.0,
            score_variance=0.0,
            error_variance=0.0,
            within_threshold_rate=0.0,
            cosine_similarity_mean=None,
            bert_similarity_mean=None,
        )

    errors = [item.difference for item in comparisons]
    abs_errors = [item.abs_difference for item in comparisons]
    ai_scores = [item.ai_score for item in comparisons]
    within_threshold = [item.abs_difference <= threshold for item in comparisons]

    mse = mean([error**2 for error in errors])
    mae = mean(abs_errors)

    score_var = variance(ai_scores) if len(ai_scores) > 1 else 0.0
    error_var = variance(errors) if len(errors) > 1 else 0.0

    return EvaluationMetrics(
        mse=round(mse, 4),
        mae=round(mae, 4),
        score_variance=round(score_var, 4),
        error_variance=round(error_var, 4),
        within_threshold_rate=round(sum(within_threshold) / len(within_threshold), 4),
        cosine_similarity_mean=None,
        bert_similarity_mean=None,
    )


# ---------------------------------------------------------------------
# 5-round calibration
# ---------------------------------------------------------------------


def calibrate_rubric_rounds(payload: CalibrationRequest) -> CalibrationResponse:
    """
    Temporary 5-round calibration skeleton.

    Later, this should call:
    src/grading_tool/evaluation/calibration.py
    """
    rounds: List[CalibrationRoundResult] = []
    current_rubric = payload.original_rubric
    best_mse = float("inf")
    best_round_index = 1
    best_rubric = current_rubric
    previous_mse: float | None = None
    stopping_reason = "Reached max rounds."

    for round_index in range(1, payload.max_rounds + 1):
        grade_results = [
            score_answer(
                student_id=submission.student_id,
                answer=submission.answer,
                question_id=payload.question_id or submission.question_id,
            )
            for submission in payload.submissions
        ]

        evaluation = evaluate_with_ground_truth(
            EvaluationRequest(
                ai_results=grade_results,
                professor_grades=payload.professor_grades,
                difference_threshold=payload.difference_threshold,
                include_semantic_metrics=payload.include_semantic_metrics,
            )
        )

        current_mse = evaluation.metrics.mse

        if current_mse < best_mse:
            best_mse = current_mse
            best_round_index = round_index
            best_rubric = current_rubric

        revision_note = None

        if payload.target_mse is not None and current_mse <= payload.target_mse:
            stopping_reason = f"Stopped because target MSE {payload.target_mse} was reached."
            rounds.append(
                CalibrationRoundResult(
                    round_index=round_index,
                    rubric=current_rubric,
                    grade_results=grade_results,
                    evaluation=evaluation,
                    revision_note=revision_note,
                )
            )
            break

        if previous_mse is not None:
            improvement = previous_mse - current_mse
            if improvement >= 0 and improvement < payload.min_improvement:
                stopping_reason = (
                    f"Stopped because MSE improvement {round(improvement, 4)} "
                    f"was below min_improvement {payload.min_improvement}."
                )
                rounds.append(
                    CalibrationRoundResult(
                        round_index=round_index,
                        rubric=current_rubric,
                        grade_results=grade_results,
                        evaluation=evaluation,
                        revision_note=revision_note,
                    )
                )
                break

        flagged_count = evaluation.flagged_count
        revision_note = (
            f"Round {round_index}: {flagged_count} cases exceeded the difference threshold. "
            "Rubric should clarify partial-credit rules for those disagreement cases."
        )

        current_rubric = {
            "previous_rubric": current_rubric,
            "calibration_round": round_index,
            "revision_note": revision_note,
        }

        rounds.append(
            CalibrationRoundResult(
                round_index=round_index,
                rubric=current_rubric,
                grade_results=grade_results,
                evaluation=evaluation,
                revision_note=revision_note,
            )
        )

        previous_mse = current_mse

    return CalibrationResponse(
        question_id=payload.question_id,
        max_rounds=payload.max_rounds,
        completed_rounds=len(rounds),
        best_round_index=best_round_index,
        best_mse=round(best_mse, 4) if best_mse != float("inf") else 0.0,
        best_rubric=best_rubric,
        rounds=rounds,
        stopping_reason=stopping_reason,
    )