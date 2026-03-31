from __future__ import annotations

from collections import defaultdict

from src.grading_tool.evaluation.metrics import (
    exact_match_rate,
    mean_absolute_error,
    pearson_corr,
    spearman_corr,
)


def build_professor_index(professor_grade_file: list[dict]) -> dict[tuple[str, str], float]:
    out: dict[tuple[str, str], float] = {}
    for row in professor_grade_file:
        student_id = row["student_id"]
        for g in row["grades"]:
            out[(student_id, g["question_id"])] = float(g["score"])
    return out


def evaluate_run(run_payload: dict, professor_grade_file: list[dict]) -> dict:
    prof_index = build_professor_index(professor_grade_file)

    y_true: list[float] = []
    y_pred: list[float] = []

    per_question_true: dict[str, list[float]] = defaultdict(list)
    per_question_pred: dict[str, list[float]] = defaultdict(list)

    for row in run_payload["results"]:
        key = (row["student_id"], row["question_id"])
        if key not in prof_index:
            continue

        truth = prof_index[key]
        pred = float(row["score_awarded"])

        y_true.append(truth)
        y_pred.append(pred)

        per_question_true[row["question_id"]].append(truth)
        per_question_pred[row["question_id"]].append(pred)

    per_question = []
    for qid in sorted(per_question_true):
        q_true = per_question_true[qid]
        q_pred = per_question_pred[qid]
        per_question.append(
            {
                "question_id": qid,
                "mae": mean_absolute_error(q_true, q_pred),
                "exact_match_rate": exact_match_rate(q_true, q_pred),
                "n": len(q_true),
            }
        )

    return {
        "run_name": run_payload.get("run_name", "unknown_run"),
        "prompt_name": run_payload.get("prompt_name"),
        "model_name": run_payload.get("model_name"),
        "n_graded": len(y_true),
        "mae": mean_absolute_error(y_true, y_pred),
        "exact_match_rate": exact_match_rate(y_true, y_pred),
        "pearson_correlation": pearson_corr(y_true, y_pred),
        "spearman_correlation": spearman_corr(y_true, y_pred),
        "per_question": per_question,
    }