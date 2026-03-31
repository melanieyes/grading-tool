from __future__ import annotations

from collections import defaultdict

from src.grading_tool.evaluation.metrics import (
    average_cosine_similarity,
    bertscore_f1,
    exact_match_rate,
    mean_absolute_error,
    mean_squared_error,
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


def _extract_reference_text(raw_response: dict) -> str:
    """
    Try to build a reference-like text from criterion justifications if available.
    This is only a proxy for semantic similarity, since we do not yet store
    explicit professor feedback text.
    """
    parts = []
    for item in raw_response.get("criterion_results", []):
        justification = str(item.get("justification", "")).strip()
        if justification:
            parts.append(justification)
    return " ".join(parts).strip()


def _extract_prediction_text(result_row: dict) -> str:
    feedback = str(result_row.get("feedback", "")).strip()
    return feedback


def evaluate_run(run_payload: dict, professor_grade_file: list[dict]) -> dict:
    prof_index = build_professor_index(professor_grade_file)

    y_true: list[float] = []
    y_pred: list[float] = []

    per_question_true: dict[str, list[float]] = defaultdict(list)
    per_question_pred: dict[str, list[float]] = defaultdict(list)

    semantic_refs: list[str] = []
    semantic_preds: list[str] = []

    for row in run_payload["results"]:
        key = (row["student_id"], row["question_id"])
        if key not in prof_index:
            continue

        truth = prof_index[key]
        pred = float(row["score_awarded"])

        y_true.append(truth)
        y_pred.append(pred)

        qid = row["question_id"]
        per_question_true[qid].append(truth)
        per_question_pred[qid].append(pred)

        pred_text = _extract_prediction_text(row)
        ref_text = _extract_reference_text(row.get("raw_response", {}))

        if pred_text and ref_text:
            semantic_preds.append(pred_text)
            semantic_refs.append(ref_text)

    per_question = []
    for qid in sorted(per_question_true):
        q_true = per_question_true[qid]
        q_pred = per_question_pred[qid]
        per_question.append(
            {
                "question_id": qid,
                "mae": mean_absolute_error(q_true, q_pred),
                "mse": mean_squared_error(q_true, q_pred),
                "exact_match_rate": exact_match_rate(q_true, q_pred),
                "n": len(q_true),
            }
        )

    report = {
        "run_name": run_payload.get("run_name", "unknown_run"),
        "prompt_name": run_payload.get("prompt_name"),
        "model_name": run_payload.get("model_name"),
        "n_graded": len(y_true),
        "mae": mean_absolute_error(y_true, y_pred),
        "mse": mean_squared_error(y_true, y_pred),
        "exact_match_rate": exact_match_rate(y_true, y_pred),
        "pearson_correlation": pearson_corr(y_true, y_pred),
        "spearman_correlation": spearman_corr(y_true, y_pred),
        "per_question": per_question,
    }

    # Optional semantic metrics
    try:
        report["bertscore_f1"] = bertscore_f1(semantic_refs, semantic_preds)
    except Exception as e:
        report["bertscore_f1"] = None
        report["bertscore_error"] = str(e)

    try:
        report["average_cosine_similarity"] = average_cosine_similarity(semantic_refs, semantic_preds)
    except Exception as e:
        report["average_cosine_similarity"] = None
        report["cosine_similarity_error"] = str(e)

    return report