from __future__ import annotations

from src.grading_tool.utils.io import load_json


def summarize_prompt_reports(report_paths: list[str]) -> list[dict]:
    rows = []
    for path in report_paths:
        report = load_json(path)
        rows.append({
            "run_name": report["run_name"],
            "mae": report["mae"],
            "exact_match_rate": report["exact_match_rate"],
            "pearson_correlation": report["pearson_correlation"],
            "spearman_correlation": report["spearman_correlation"],
            "n_graded": report["n_graded"],
        })
    rows.sort(key=lambda x: x["mae"])
    return rows