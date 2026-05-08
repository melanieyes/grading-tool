from __future__ import annotations

from src.grading_tool.utils.io import load_json


def summarize_prompt_reports(report_paths: list[str]) -> list[dict]:
    rows = []

    for path in report_paths:
        report = load_json(path)

        rows.append(
            {
                "run_name": report["run_name"],
                "model_name": report.get("model_name"),
                "prompt_name": report.get("prompt_name"),

                # Raw score metrics
                "mae": report.get("mae"),
                "mse": report.get("mse"),

                # Normalized score metrics
                "normalized_mae": report.get("normalized_mae"),
                "normalized_mse": report.get("normalized_mse"),

                # Variance / stability
                "score_variance": report.get("score_variance"),
                "error_variance": report.get("error_variance"),
                "normalized_error_variance": report.get("normalized_error_variance"),

                # Agreement
                "within_threshold_rate": report.get("within_threshold_rate"),
                "normalized_within_threshold_rate": report.get(
                    "normalized_within_threshold_rate"
                ),
                "exact_match_rate": report.get("exact_match_rate"),
                "pearson_correlation": report.get("pearson_correlation"),
                "spearman_correlation": report.get("spearman_correlation"),

                # Semantic metrics
                "bertscore_f1": report.get("bertscore_f1"),
                "average_cosine_similarity": report.get("average_cosine_similarity"),

                # Error counts
                "flagged_count": report.get("flagged_count"),
                "normalized_flagged_count": report.get("normalized_flagged_count"),
                "n_graded": report.get("n_graded"),
                "n_unmatched": report.get("n_unmatched", 0),
            }
        )

    rows.sort(
        key=lambda x: (
            x["normalized_mse"]
            if x["normalized_mse"] is not None
            else float("inf"),
            x["normalized_mae"]
            if x["normalized_mae"] is not None
            else float("inf"),
            x["mse"] if x["mse"] is not None else float("inf"),
            x["mae"] if x["mae"] is not None else float("inf"),
        )
    )

    return rows


def build_evaluation_summary(report: dict) -> dict:
    return {
        "run_name": report.get("run_name"),
        "prompt_name": report.get("prompt_name"),
        "model_name": report.get("model_name"),
        "n_graded": report.get("n_graded", 0),
        "n_unmatched": report.get("n_unmatched", 0),

        # Raw metrics
        "mse": report.get("mse"),
        "mae": report.get("mae"),

        # Normalized metrics
        "normalized_mse": report.get("normalized_mse"),
        "normalized_mae": report.get("normalized_mae"),

        # Stability
        "score_variance": report.get("score_variance"),
        "error_variance": report.get("error_variance"),
        "normalized_error_variance": report.get("normalized_error_variance"),

        # Agreement
        "within_threshold_rate": report.get("within_threshold_rate"),
        "normalized_within_threshold_rate": report.get(
            "normalized_within_threshold_rate"
        ),

        # Semantic feedback quality
        "bertscore_f1": report.get("bertscore_f1"),
        "average_cosine_similarity": report.get("average_cosine_similarity"),

        # Review workload
        "flagged_count": report.get("flagged_count", 0),
        "normalized_flagged_count": report.get("normalized_flagged_count", 0),
    }


def build_flagged_case_table(report: dict, use_normalized: bool = True) -> list[dict]:
    key = "normalized_flagged_cases" if use_normalized else "flagged_cases"

    return [
        {
            "student_id": item.get("student_id"),
            "question_id": item.get("question_id"),
            "benchmark_type": item.get("benchmark_type"),
            "score_max": item.get("score_max"),
            "professor_score": item.get("professor_score"),
            "ai_score": item.get("ai_score"),
            "difference": item.get("difference"),
            "abs_difference": item.get("abs_difference"),
            "normalized_difference": item.get("normalized_difference"),
            "normalized_abs_difference": item.get("normalized_abs_difference"),
        }
        for item in report.get(key, [])
    ]


def build_per_question_table(report: dict) -> list[dict]:
    return [
        {
            "question_id": item.get("question_id"),
            "n": item.get("n"),
            "mae": item.get("mae"),
            "mse": item.get("mse"),
            "normalized_mae": item.get("normalized_mae"),
            "normalized_mse": item.get("normalized_mse"),
            "within_threshold_rate": item.get("within_threshold_rate"),
            "normalized_within_threshold_rate": item.get(
                "normalized_within_threshold_rate"
            ),
            "exact_match_rate": item.get("exact_match_rate"),
            "error_variance": item.get("error_variance"),
            "normalized_error_variance": item.get("normalized_error_variance"),
        }
        for item in report.get("per_question", [])
    ]


def build_per_benchmark_type_table(report: dict) -> list[dict]:
    """
    This is the table you need for the research question:

    Which question type does the LLM grade well?
    Which question type does the LLM fail on?
    """
    rows = []

    for item in report.get("per_benchmark_type", []):
        rows.append(
            {
                "benchmark_type": item.get("benchmark_type"),
                "n": item.get("n"),
                "mae": item.get("mae"),
                "mse": item.get("mse"),
                "normalized_mae": item.get("normalized_mae"),
                "normalized_mse": item.get("normalized_mse"),
                "within_threshold_rate": item.get("within_threshold_rate"),
                "normalized_within_threshold_rate": item.get(
                    "normalized_within_threshold_rate"
                ),
                "exact_match_rate": item.get("exact_match_rate"),
                "error_variance": item.get("error_variance"),
                "normalized_error_variance": item.get("normalized_error_variance"),
            }
        )

    rows.sort(
        key=lambda x: (
            x["normalized_mse"]
            if x["normalized_mse"] is not None
            else float("inf"),
            x["normalized_mae"]
            if x["normalized_mae"] is not None
            else float("inf"),
        )
    )

    return rows