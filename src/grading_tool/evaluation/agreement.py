from __future__ import annotations

from collections import defaultdict
from typing import Any

from src.grading_tool.evaluation.metrics import (
    average_cosine_similarity,
    bertscore_f1,
    error_variance,
    exact_match_rate,
    mean_absolute_error,
    mean_squared_error,
    normalized_error_variance,
    normalized_mean_absolute_error,
    normalized_mean_squared_error,
    normalized_within_threshold_rate,
    pearson_corr,
    score_variance,
    spearman_corr,
    within_threshold_rate,
)


def build_professor_index(professor_grade_file: list[dict]) -> dict[tuple[str, str], dict]:
    """
    Supports professor grade format like:

    [
        {
            "student_id": "student001",
            "grades": [
                {
                    "question_id": "Q1",
                    "score": 8,
                    "comment": "..."
                }
            ]
        }
    ]
    """
    out: dict[tuple[str, str], dict] = {}

    for row in professor_grade_file:
        student_id = row["student_id"]

        for grade in row.get("grades", []):
            question_id = grade["question_id"]
            out[(student_id, question_id)] = grade

    return out


def _extract_reference_text(raw_response: dict[str, Any], professor_grade: dict | None = None) -> str:
    """
    Best reference text priority:
    1. professor comment, if available
    2. rubric/criterion justifications from raw_response
    3. empty string
    """
    if professor_grade:
        professor_comment = str(professor_grade.get("comment", "")).strip()
        if professor_comment:
            return professor_comment

    parts: list[str] = []

    for item in raw_response.get("criterion_results", []):
        justification = str(item.get("justification", "")).strip()

        if justification:
            parts.append(justification)

    return " ".join(parts).strip()


def _extract_prediction_text(result_row: dict[str, Any]) -> str:
    """
    Best prediction text priority:
    1. feedback
    2. reasoning
    3. raw_response final_feedback
    4. empty string
    """
    feedback = str(result_row.get("feedback", "")).strip()
    if feedback:
        return feedback

    reasoning = str(result_row.get("reasoning", "")).strip()
    if reasoning:
        return reasoning

    raw_response = result_row.get("raw_response", {})
    if isinstance(raw_response, dict):
        final_feedback = str(raw_response.get("final_feedback", "")).strip()
        if final_feedback:
            return final_feedback

    return ""


def _extract_score(result_row: dict[str, Any]) -> float:
    """
    Supports both old CLI result format and new API result format.
    """
    if "score_awarded" in result_row:
        return float(result_row["score_awarded"])

    if "score" in result_row:
        return float(result_row["score"])

    raise KeyError("Result row must contain either 'score_awarded' or 'score'.")


def _extract_score_max(result_row: dict[str, Any], professor_grade: dict[str, Any] | None = None) -> float:
    """
    Prefer score_max from the AI run because it is already attached to each
    graded result. Fall back to professor grade max_score if available.
    """
    if "score_max" in result_row and result_row["score_max"] is not None:
        return float(result_row["score_max"])

    if professor_grade:
        for key in ("score_max", "max_score", "points", "total_points"):
            if key in professor_grade and professor_grade[key] is not None:
                return float(professor_grade[key])

    truth = float(professor_grade["score"]) if professor_grade and "score" in professor_grade else 0.0
    pred = _extract_score(result_row)

    return max(truth, pred, 1.0)


def _extract_benchmark_type(result_row: dict[str, Any]) -> str:
    """
    Uses benchmark_type from the grading result.

    This is the field you added because you want to know which question type
    the LLM handles well: algorithm_design, cfg_design, unambiguous_cfg_design,
    etc.
    """
    benchmark_type = str(result_row.get("benchmark_type", "")).strip()
    if benchmark_type:
        return benchmark_type

    return "unknown"


def _build_metric_block(
    y_true: list[float],
    y_pred: list[float],
    score_max: list[float],
    raw_threshold: float,
    normalized_threshold: float,
) -> dict:
    return {
        "mae": mean_absolute_error(y_true, y_pred),
        "mse": mean_squared_error(y_true, y_pred),
        "normalized_mae": normalized_mean_absolute_error(y_true, y_pred, score_max),
        "normalized_mse": normalized_mean_squared_error(y_true, y_pred, score_max),
        "exact_match_rate": exact_match_rate(y_true, y_pred),
        "score_variance": score_variance(y_pred),
        "error_variance": error_variance(y_true, y_pred),
        "normalized_error_variance": normalized_error_variance(y_true, y_pred, score_max),
        "within_threshold_rate": within_threshold_rate(
            y_true,
            y_pred,
            threshold=raw_threshold,
        ),
        "normalized_within_threshold_rate": normalized_within_threshold_rate(
            y_true,
            y_pred,
            score_max,
            threshold=normalized_threshold,
        ),
        "n": len(y_true),
    }


def evaluate_run(
    run_payload: dict,
    professor_grade_file: list[dict],
    difference_threshold: float = 0.5,
    normalized_difference_threshold: float = 0.10,
    include_semantic_metrics: bool = True,
) -> dict:
    prof_index = build_professor_index(professor_grade_file)

    y_true: list[float] = []
    y_pred: list[float] = []
    score_maxes: list[float] = []

    per_question_true: dict[str, list[float]] = defaultdict(list)
    per_question_pred: dict[str, list[float]] = defaultdict(list)
    per_question_max: dict[str, list[float]] = defaultdict(list)

    per_benchmark_true: dict[str, list[float]] = defaultdict(list)
    per_benchmark_pred: dict[str, list[float]] = defaultdict(list)
    per_benchmark_max: dict[str, list[float]] = defaultdict(list)

    semantic_refs: list[str] = []
    semantic_preds: list[str] = []

    comparisons: list[dict] = []
    flagged_cases: list[dict] = []
    normalized_flagged_cases: list[dict] = []

    unmatched_results: list[dict] = []

    for row in run_payload.get("results", []):
        student_id = row["student_id"]
        question_id = row["question_id"]
        benchmark_type = _extract_benchmark_type(row)

        key = (student_id, question_id)

        if key not in prof_index:
            unmatched_results.append(
                {
                    "student_id": student_id,
                    "question_id": question_id,
                    "benchmark_type": benchmark_type,
                    "reason": "No matching professor grade found.",
                }
            )
            continue

        professor_grade = prof_index[key]
        truth = float(professor_grade["score"])
        pred = _extract_score(row)
        score_max = _extract_score_max(row, professor_grade)

        difference = pred - truth
        abs_difference = abs(difference)

        normalized_difference = difference / score_max if score_max > 0 else 0.0
        normalized_abs_difference = abs(normalized_difference)

        flagged = abs_difference > difference_threshold
        normalized_flagged = normalized_abs_difference > normalized_difference_threshold

        y_true.append(truth)
        y_pred.append(pred)
        score_maxes.append(score_max)

        per_question_true[question_id].append(truth)
        per_question_pred[question_id].append(pred)
        per_question_max[question_id].append(score_max)

        per_benchmark_true[benchmark_type].append(truth)
        per_benchmark_pred[benchmark_type].append(pred)
        per_benchmark_max[benchmark_type].append(score_max)

        comparison = {
            "student_id": student_id,
            "question_id": question_id,
            "benchmark_type": benchmark_type,
            "score_max": score_max,
            "professor_score": truth,
            "ai_score": pred,
            "difference": difference,
            "abs_difference": abs_difference,
            "normalized_difference": normalized_difference,
            "normalized_abs_difference": normalized_abs_difference,
            "flagged": flagged,
            "normalized_flagged": normalized_flagged,
        }

        comparisons.append(comparison)

        if flagged:
            flagged_cases.append(comparison)

        if normalized_flagged:
            normalized_flagged_cases.append(comparison)

        pred_text = _extract_prediction_text(row)
        ref_text = _extract_reference_text(row.get("raw_response", {}), professor_grade)

        if pred_text and ref_text:
            semantic_preds.append(pred_text)
            semantic_refs.append(ref_text)

    per_question = []

    for question_id in sorted(per_question_true):
        q_true = per_question_true[question_id]
        q_pred = per_question_pred[question_id]
        q_max = per_question_max[question_id]

        metric_block = _build_metric_block(
            q_true,
            q_pred,
            q_max,
            raw_threshold=difference_threshold,
            normalized_threshold=normalized_difference_threshold,
        )

        per_question.append(
            {
                "question_id": question_id,
                **metric_block,
            }
        )

    per_benchmark_type = []

    for benchmark_type in sorted(per_benchmark_true):
        b_true = per_benchmark_true[benchmark_type]
        b_pred = per_benchmark_pred[benchmark_type]
        b_max = per_benchmark_max[benchmark_type]

        metric_block = _build_metric_block(
            b_true,
            b_pred,
            b_max,
            raw_threshold=difference_threshold,
            normalized_threshold=normalized_difference_threshold,
        )

        per_benchmark_type.append(
            {
                "benchmark_type": benchmark_type,
                **metric_block,
            }
        )

    report = {
        "run_name": run_payload.get("run_name", "unknown_run"),
        "prompt_name": run_payload.get("prompt_name"),
        "model_name": run_payload.get("model_name"),
        "n_results_in_run": len(run_payload.get("results", [])),
        "n_graded": len(y_true),
        "n_unmatched": len(unmatched_results),
        "mae": mean_absolute_error(y_true, y_pred),
        "mse": mean_squared_error(y_true, y_pred),
        "normalized_mae": normalized_mean_absolute_error(y_true, y_pred, score_maxes),
        "normalized_mse": normalized_mean_squared_error(y_true, y_pred, score_maxes),
        "exact_match_rate": exact_match_rate(y_true, y_pred),
        "pearson_correlation": pearson_corr(y_true, y_pred),
        "spearman_correlation": spearman_corr(y_true, y_pred),
        "score_variance": score_variance(y_pred),
        "error_variance": error_variance(y_true, y_pred),
        "normalized_error_variance": normalized_error_variance(y_true, y_pred, score_maxes),
        "within_threshold_rate": within_threshold_rate(
            y_true,
            y_pred,
            threshold=difference_threshold,
        ),
        "normalized_within_threshold_rate": normalized_within_threshold_rate(
            y_true,
            y_pred,
            score_maxes,
            threshold=normalized_difference_threshold,
        ),
        "difference_threshold": difference_threshold,
        "normalized_difference_threshold": normalized_difference_threshold,
        "flagged_count": len(flagged_cases),
        "normalized_flagged_count": len(normalized_flagged_cases),
        "flagged_cases": flagged_cases,
        "normalized_flagged_cases": normalized_flagged_cases,
        "unmatched_results": unmatched_results,
        "comparisons": comparisons,
        "per_question": per_question,
        "per_benchmark_type": per_benchmark_type,
    }

    if include_semantic_metrics:
        try:
            report["bertscore_f1"] = bertscore_f1(semantic_refs, semantic_preds)
        except Exception as e:
            report["bertscore_f1"] = None
            report["bertscore_error"] = str(e)

        try:
            report["average_cosine_similarity"] = average_cosine_similarity(
                semantic_refs,
                semantic_preds,
            )
        except Exception as e:
            report["average_cosine_similarity"] = None
            report["cosine_similarity_error"] = str(e)
    else:
        report["bertscore_f1"] = None
        report["average_cosine_similarity"] = None

    return report