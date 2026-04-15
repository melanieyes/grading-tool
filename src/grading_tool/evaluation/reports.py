from __future__ import annotations

from src.grading_tool.utils.io import load_json


def summarize_prompt_reports(report_paths: list[str]) -> list[dict]:
    rows = []
    for path in report_paths:
        report = load_json(path)
        rows.append({
            "run_name": report["run_name"],
            "model_name": report.get("model_name"),
            "mae": report["mae"],
            "exact_match_rate": report["exact_match_rate"],
            "pearson_correlation": report["pearson_correlation"],
            "spearman_correlation": report["spearman_correlation"],
            "bertscore_f1": report.get("bertscore_f1"),
            "average_cosine_similarity": report.get("average_cosine_similarity"),
            "n_graded": report["n_graded"],
        })
    rows.sort(key=lambda x: x["mae"])
    return rows
