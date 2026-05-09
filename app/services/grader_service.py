from collections import Counter, defaultdict
from statistics import mean
from typing import Dict, List, Tuple

from app.schemas.api_models import (
    BatchGradeResponse,
    CalibrationRequest,
    CalibrationResponse,
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
from src.grading_tool.evaluation.calibration import run_calibration
from src.grading_tool.evaluation.metrics import (
    error_variance,
    mean_absolute_error,
    mean_squared_error,
    score_variance,
    within_threshold_rate,
)
from src.grading_tool.grading.rubric_grader import RubricGrader
from src.grading_tool.grading.rubric_reviser import revise_rubric as revise_rubric_core


def score_answer(student_id: str, answer: str, question_id: str = "Q1") -> GradeResult:
    """
    Temporary rule-based scorer.

    Later, this should call the real LLM grading pipeline.
    For now, it keeps the old frontend working.
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

        results.append(
            SurveyCommentResult(
                student_id=submission.student_id,
                question_id=payload.question_id or submission.question_id,
                strengths=strengths,
                weaknesses=weaknesses,
                mistake_tags=tags,
                comment=" ".join(strengths + weaknesses),
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
    core_result = revise_rubric_core(
        original_rubric=payload.original_rubric,
        mistake_stats=payload.mistake_stats.model_dump() if payload.mistake_stats else None,
        flagged_cases=None,
        instructor_note=payload.instructor_note,
    )

    return RubricRevisionResponse(
        question_id=payload.question_id,
        revision_needed=core_result["revision_needed"],
        revised_rubric=core_result["revised_rubric"],
        change_log=[
            RubricChangeLogItem(
                old=item.get("old"),
                new=item.get("new"),
                justification=item.get("justification", ""),
            )
            for item in core_result.get("change_log", [])
        ],
        justification=core_result.get("justification", ""),
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

    y_true = [item.professor_score for item in comparisons]
    y_pred = [item.ai_score for item in comparisons]

    return EvaluationMetrics(
        mse=round(mean_squared_error(y_true, y_pred), 4),
        mae=round(mean_absolute_error(y_true, y_pred), 4),
        score_variance=round(score_variance(y_pred), 4),
        error_variance=round(error_variance(y_true, y_pred), 4),
        within_threshold_rate=round(within_threshold_rate(y_true, y_pred, threshold), 4),
        cosine_similarity_mean=None,
        bert_similarity_mean=None,
    )


# ---------------------------------------------------------------------
# 5-round calibration
# ---------------------------------------------------------------------


def calibrate_rubric_rounds(payload: CalibrationRequest) -> CalibrationResponse:
    grader = RubricGrader(prompt_name="prompt_v1")

    def _grade_fn(submissions: list[dict], rubric: dict) -> list[dict]:
        criteria = rubric.get("criteria") or []
        score_max = float(sum(c.get("points", 0) for c in criteria)) if criteria else 10.0
        if score_max <= 0:
            score_max = 10.0

        results = []
        for submission in submissions:
            try:
                qgr = grader.grade_question(
                    student_id=submission["student_id"],
                    question_id=submission.get("question_id", payload.question_id),
                    benchmark_type=payload.benchmark_type,
                    question_text=payload.question_text or "",
                    rubric=rubric,
                    student_answer=submission["answer"],
                    score_max=score_max,
                    reference_solution=payload.solution,
                )
                results.append(
                    {
                        "student_id": qgr.student_id,
                        "question_id": qgr.question_id,
                        "score": qgr.score_awarded,
                        "max_score": qgr.score_max,
                        "confidence": qgr.confidence,
                        "review_required": qgr.review_required,
                        "review_reason": "",
                        "reasoning": qgr.feedback,
                    }
                )
            except Exception:
                fallback = score_answer(
                    student_id=submission["student_id"],
                    answer=submission["answer"],
                    question_id=submission.get("question_id", payload.question_id),
                )
                results.append(fallback.model_dump())

        return results

    result = run_calibration(
        question_id=payload.question_id,
        original_rubric=payload.original_rubric,
        submissions=[submission.model_dump() for submission in payload.submissions],
        professor_grades=[grade.model_dump() for grade in payload.professor_grades],
        grade_fn=_grade_fn,
        evaluate_fn=_calibration_evaluate_fn,
        max_rounds=payload.max_rounds,
        difference_threshold=payload.difference_threshold,
        normalized_difference_threshold=payload.normalized_difference_threshold,
        target_mse=payload.target_mse,
        min_improvement=payload.min_improvement,
        include_semantic_metrics=payload.include_semantic_metrics,
    )

    return CalibrationResponse.model_validate(result)


def _calibration_evaluate_fn(
    grade_results: list[dict],
    professor_grades: list[dict],
    difference_threshold: float,
    normalized_difference_threshold: float,
    include_semantic_metrics: bool,
) -> dict:
    ai_results = [GradeResult.model_validate(item) for item in grade_results]
    prof_results = [ProfessorGradeInput.model_validate(item) for item in professor_grades]
    prof_lookup = {(p.student_id, p.question_id): p for p in prof_results}

    response = evaluate_with_ground_truth(
        EvaluationRequest(
            ai_results=ai_results,
            professor_grades=prof_results,
            difference_threshold=difference_threshold,
            include_semantic_metrics=include_semantic_metrics,
        )
    )

    result = response.model_dump()

    normalized_flagged = []
    for comp in response.comparisons:
        prof = prof_lookup.get((comp.student_id, comp.question_id))
        max_score = float(prof.max_score) if prof and prof.max_score else 1.0
        if max_score > 0 and (comp.abs_difference / max_score) > normalized_difference_threshold:
            normalized_flagged.append(comp.model_dump())

    result["normalized_flagged_cases"] = normalized_flagged
    return result