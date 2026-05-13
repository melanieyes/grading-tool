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
    GeneratedRubricItem,
    RubricGenerationRequest,
    RubricGenerationResponse,
    RubricLLMReviseRequest,
    RubricLLMReviseResponse,
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
from src.grading_tool.grading.rubric_generator import (
    RubricGenerator,
    format_rubric_as_text,
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


def _parse_rubric_text(rubric_text: str, score_max: float) -> dict:
    import re

    lines = [line.strip() for line in (rubric_text or "").splitlines() if line.strip()]
    criteria = []
    idx = 1

    for line in lines:
        cleaned = re.sub(r"^[-*\d.\s]+", "", line).strip()
        match = re.search(r"\((\s*0\s*[-–]\s*(\d+(?:\.\d+)?)\s*)\)", cleaned)
        if match:
            max_points = float(match.group(2))
            desc = re.sub(r"\(\s*0\s*[-–]\s*(\d+(?:\.\d+)?)\s*\)", "", cleaned).strip()
        else:
            max_points = None
            desc = cleaned



        if not desc:
            continue

        criteria.append(
            {
                "criterion_id": f"c{idx}",
                "points": float(max_points) if max_points is not None else 0.0,
                "description": desc,
            }
        )
        idx += 1

    # If no explicit point ranges were provided, allocate all points to a single criterion.
    if not criteria:
        criteria = [
            {
                "criterion_id": "c1",
                "points": float(score_max),
                "description": rubric_text.strip() or "Overall correctness and reasoning",
            }
        ]

    # If some criteria have 0 points because we couldn't parse ranges, spread remaining.
    parsed_total = sum(float(c.get("points", 0.0) or 0.0) for c in criteria)
    if parsed_total <= 0:
        criteria[0]["points"] = float(score_max)
    elif parsed_total != float(score_max):
        # Keep relative weights but normalize to score_max.
        scale = float(score_max) / parsed_total
        for c in criteria:
            c["points"] = round(float(c.get("points", 0.0) or 0.0) * scale, 4)

    return {"criteria": criteria}


def grade_batch(submissions: List[GradeRequest], api_key: str | None = None) -> BatchGradeResponse:
    results = []

    for item in submissions:
        use_rubric = bool(item.rubric) and bool(item.question_text)

        # In case there are questions in the Submissions that are not in the Generated Rubric
        if not use_rubric:
            results.append(
                GradeResult(
                    student_id=item.student_id,
                    question_id=item.question_id,
                    score=0.0,
                    max_score=float(0),
                    confidence=0.0,
                    review_required=True,
                    review_reason="no_rubric",
                    reasoning="No rubric found for this question. Cannot grade automatically.",
                )
            )
            continue

        if use_rubric:
            try:
                score_max = float(item.max_score or 10)
                benchmark_type = item.benchmark_type or "short_answer"

                if isinstance(item.rubric, str):
                    rubric_payload = _parse_rubric_text(item.rubric, score_max)
                elif isinstance(item.rubric, dict):
                    rubric_payload = item.rubric
                else:
                    rubric_payload = {"criteria": []}

                grader = RubricGrader(prompt_name="prompt_v1", api_key=api_key)
                grade = grader.grade_question(
                    student_id=item.student_id,
                    question_id=item.question_id,
                    benchmark_type=benchmark_type,
                    question_text=item.question_text or "",
                    rubric=rubric_payload,
                    student_answer=item.answer,
                    score_max=score_max,
                    reference_solution=item.reference_solution,
                )

                results.append(
                    GradeResult(
                        student_id=grade.student_id,
                        question_id=grade.question_id,
                        score=float(grade.score_awarded),
                        max_score=float(grade.score_max),
                        confidence=float(grade.confidence),
                        review_required=bool(grade.review_required),
                        review_reason="rubric_grader_flag" if grade.review_required else "",
                        reasoning=str(grade.feedback or ""),
                    )
                )
                continue
            except Exception:
                # Fall back to rule-based scorer if Gemini grading fails.
                pass

        results.append(
            score_answer(
                student_id=item.student_id,
                answer=item.answer,
                question_id=item.question_id,
            )
        )

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
# Rubric generation
# ---------------------------------------------------------------------


def generate_rubric(
    payload: RubricGenerationRequest,
    api_key: str | None = None,
) -> RubricGenerationResponse:
    solution_lookup: Dict[str, str] = {}
    for raw in payload.solutions or []:
        if not isinstance(raw, dict):
            continue
        qid = raw.get("question_id") or raw.get("id")
        sol = raw.get("solution") or raw.get("reference_solution") or raw.get("answer")
        if qid and isinstance(sol, str) and sol.strip():
            solution_lookup[str(qid)] = sol.strip()

    generator = RubricGenerator(api_key=api_key)

    items: List[GeneratedRubricItem] = []
    rubrics: Dict[str, str] = {}
    failed = 0

    for q in payload.questions:
        solution = q.reference_solution or solution_lookup.get(q.question_id)
        try:
            rubric_obj = generator.generate(
                question_text=q.question_text,
                max_score=q.max_score,
                reference_solution=solution,
            )
            rubric_text = format_rubric_as_text(rubric_obj)
            rubrics[q.question_id] = rubric_text
            items.append(
                GeneratedRubricItem(
                    question_id=q.question_id,
                    rubric_text=rubric_text,
                    rubric=rubric_obj,
                )
            )
        except Exception as exc:
            failed += 1
            items.append(
                GeneratedRubricItem(
                    question_id=q.question_id,
                    rubric_text="",
                    rubric=None,
                    error=str(exc),
                )
            )

    return RubricGenerationResponse(
        count=len(payload.questions),
        generated=len(payload.questions) - failed,
        failed=failed,
        rubrics=rubrics,
        items=items,
    )


def revise_rubric_llm(
    payload: RubricLLMReviseRequest,
    api_key: str | None = None,
) -> RubricLLMReviseResponse:
    generator = RubricGenerator(api_key=api_key)
    rubric_obj = generator.revise(
        question_text=payload.question_text,
        current_rubric_text=payload.current_rubric,
        revision_focus=payload.revision_focus,
        max_score=payload.max_score,
        reference_solution=payload.reference_solution,
    )
    return RubricLLMReviseResponse(
        question_id=payload.question_id,
        rubric_text=format_rubric_as_text(rubric_obj),
        rubric=rubric_obj,
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


def _infer_score_max_from_professor_grades(professor_grades: list[dict]) -> float:
    for item in professor_grades or []:
        try:
            value = float(item.get("max_score", 0) or 0)
            if value > 0:
                return value
        except (TypeError, ValueError):
            continue
    return 10.0


def _normalize_rubric_for_llm(rubric_any, score_max: float) -> dict:
    """Return a rubric dict suitable for prompt payload.

    Handles:
    - plain rubric text (string)
    - rubric dicts that already have `criteria`
    - rubric dicts produced by rubric_reviser (e.g. {original_rubric: ..., revision_notes: ...})
    """
    if isinstance(rubric_any, str):
        return _parse_rubric_text(rubric_any, score_max)

    if isinstance(rubric_any, dict):
        if isinstance(rubric_any.get("criteria"), list):
            return rubric_any

        original = rubric_any.get("original_rubric")
        if isinstance(original, str) and original.strip():
            payload = _parse_rubric_text(original, score_max)
            if rubric_any.get("revision_notes") is not None:
                payload["revision_notes"] = rubric_any.get("revision_notes")
            if rubric_any.get("calibration_round") is not None:
                payload["calibration_round"] = rubric_any.get("calibration_round")
            return payload

        return rubric_any

    return {"criteria": []}


def calibrate_rubric_rounds(
    payload: CalibrationRequest,
    api_key: str | None = None,
) -> CalibrationResponse:
    submissions_dump = [submission.model_dump() for submission in payload.submissions]
    professor_dump = [grade.model_dump() for grade in payload.professor_grades]

    score_max = _infer_score_max_from_professor_grades(professor_dump)

    # Prefer explicit question_text; fall back to submission-provided question_text if present.
    question_text = (payload.question_text or "").strip()
    if not question_text and submissions_dump:
        question_text = str(submissions_dump[0].get("question_text") or "").strip()

    benchmark_type = "short_answer"
    if submissions_dump:
        bt = submissions_dump[0].get("benchmark_type")
        if isinstance(bt, str) and bt.strip():
            benchmark_type = bt.strip()

    reference_solution = payload.solution

    def grade_fn(submissions: list[dict], rubric_any) -> list[dict]:
        results: list[dict] = []

        # If we have rubric + any question context, use the real rubric grader.
        if rubric_any is not None and question_text:
            try:
                rubric_payload = _normalize_rubric_for_llm(rubric_any, score_max)
                grader = RubricGrader(prompt_name="prompt_v1", api_key=api_key)

                for submission in submissions:
                    qid = submission.get("question_id") or payload.question_id or "Q1"
                    grade = grader.grade_question(
                        student_id=submission["student_id"],
                        question_id=qid,
                        benchmark_type=benchmark_type,
                        question_text=question_text,
                        rubric=rubric_payload,
                        student_answer=submission["answer"],
                        score_max=score_max,
                        reference_solution=reference_solution,
                    )

                    results.append(
                        GradeResult(
                            student_id=grade.student_id,
                            question_id=grade.question_id,
                            score=float(grade.score_awarded),
                            max_score=float(grade.score_max),
                            confidence=float(grade.confidence),
                            review_required=bool(grade.review_required),
                            review_reason=(
                                "rubric_grader_flag" if grade.review_required else ""
                            ),
                            reasoning=str(grade.feedback or ""),
                        ).model_dump()
                    )

                return results
            except Exception:
                # Fall back to rule-based scorer if Gemini grading fails.
                results = []

        for submission in submissions:
            result = score_answer(
                student_id=submission["student_id"],
                answer=submission["answer"],
                question_id=submission.get("question_id", "Q1"),
            )
            results.append(result.model_dump())

        return results

    result = run_calibration(
        question_id=payload.question_id,
        original_rubric=payload.original_rubric,
        submissions=submissions_dump,
        professor_grades=professor_dump,
        grade_fn=grade_fn,
        evaluate_fn=_calibration_evaluate_fn,
        max_rounds=payload.max_rounds,
        difference_threshold=payload.difference_threshold,
        target_mse=payload.target_mse,
        min_improvement=payload.min_improvement,
        include_semantic_metrics=payload.include_semantic_metrics,
        instructor_note=None,
    )

    return CalibrationResponse.model_validate(result)


def _calibration_evaluate_fn(
    grade_results: list[dict],
    professor_grades: list[dict],
    difference_threshold: float,
    include_semantic_metrics: bool,
) -> dict:
    ai_results = [GradeResult.model_validate(item) for item in grade_results]
    prof_results = [ProfessorGradeInput.model_validate(item) for item in professor_grades]

    response = evaluate_with_ground_truth(
        EvaluationRequest(
            ai_results=ai_results,
            professor_grades=prof_results,
            difference_threshold=difference_threshold,
            include_semantic_metrics=include_semantic_metrics,
        )
    )

    return response.model_dump()