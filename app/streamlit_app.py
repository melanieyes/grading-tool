from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

st.set_page_config(page_title="Grading Tool Dashboard", layout="wide")


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUN_DIR = PROJECT_ROOT / "data" / "outputs" / "runs"
REPORT_DIR = PROJECT_ROOT / "data" / "outputs" / "reports"


def load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def safe_float(x: Any) -> float | None:
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None


def summarize_run(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    results = payload.get("results", [])
    skipped = payload.get("skipped", [])

    student_ids = sorted(
        {r.get("student_id") for r in results if r.get("student_id") is not None}
    )
    question_ids = sorted(
        {r.get("question_id") for r in results if r.get("question_id") is not None}
    )

    scores = [safe_float(r.get("score")) for r in results]
    scores = [s for s in scores if s is not None]

    return {
        "file": path.name,
        "run_name": payload.get("run_name", path.stem),
        "prompt_name": payload.get("prompt_name", "unknown"),
        "model_name": payload.get("model_name", "—"),
        "n_results": payload.get("n_results", len(results)),
        "n_skipped": payload.get("n_skipped", len(skipped)),
        "n_students": len(student_ids),
        "question_ids": ", ".join(question_ids) if question_ids else "—",
        "avg_score": round(sum(scores) / len(scores), 4) if scores else None,
    }


def summarize_report(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    return {
        "file": path.name,
        "run_name": payload.get("run_name", path.stem),
        "prompt_name": payload.get("prompt_name", "unknown"),
        "mae": payload.get("mae"),
        "mse": payload.get("mse"),
        "exact_match_rate": payload.get("exact_match_rate"),
        "pearson_correlation": payload.get("pearson_correlation"),
        "spearman_correlation": payload.get("spearman_correlation"),
        "bertscore_f1": payload.get("bertscore_f1"),
        "average_cosine_similarity": payload.get("average_cosine_similarity"),
        "n_graded": payload.get("n_graded"),
    }


st.title("Grading Tool Dashboard")
st.caption("Rubric-based grading runs and evaluation reports")

st.markdown(
    """
Welcome. This dashboard lets you inspect:

- saved grading runs
- subset runs such as q3-only and q7-only
- evaluation reports
- prompt comparison pages from the sidebar
"""
)

run_files = sorted(RUN_DIR.glob("*.json"))
report_files = sorted(REPORT_DIR.glob("*_eval.json"))

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.metric("Saved Runs", len(run_files))
with c2:
    st.metric("Saved Eval Reports", len(report_files))
with c3:
    st.metric("Latest Run", run_files[-1].name if run_files else "—")
with c4:
    st.metric("Latest Eval", report_files[-1].name if report_files else "—")

st.markdown("---")

st.subheader("Recent Grading Runs")

if not run_files:
    st.warning("No grading runs found in data/outputs/runs/")
else:
    run_rows = [summarize_run(p) for p in run_files[-12:]]
    run_df = pd.DataFrame(run_rows)

    st.dataframe(run_df, use_container_width=True, hide_index=True)

    st.markdown("### Inspect One Run")
    selected_run = st.selectbox(
        "Choose a run file",
        options=[p.name for p in run_files],
        index=len(run_files) - 1,
    )

    run_payload = load_json(RUN_DIR / selected_run)
    results = run_payload.get("results", [])

    a, b, c = st.columns(3)
    with a:
        st.metric("Results", run_payload.get("n_results", len(results)))
    with b:
        st.metric("Skipped", run_payload.get("n_skipped", 0))
    with c:
        st.metric("Prompt", run_payload.get("prompt_name", "unknown"))

    if results:
        df = pd.DataFrame(results)
        preferred_cols = [
            col
            for col in [
                "student_id",
                "question_id",
                "parent_question_id",
                "score",
                "score_max",
                "confidence",
                "review_required",
                "feedback",
            ]
            if col in df.columns
        ]
        if preferred_cols:
            df = df[preferred_cols]
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info("No results found in this run.")

st.markdown("---")

st.subheader("Recent Evaluation Reports")

if not report_files:
    st.info("No evaluation reports found yet.")
else:
    report_rows = [summarize_report(p) for p in report_files[-12:]]
    report_df = pd.DataFrame(report_rows)
    st.dataframe(report_df, use_container_width=True, hide_index=True)

st.markdown("---")

with st.expander("CLI examples"):
    st.code(
        """python -m src.grading_tool.cli.grade \\
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \\
  --output_path data/outputs/runs/q3_prompt_v3_10students.json \\
  --run_name q3_prompt_v3_10students \\
  --prompt_name prompt_v3 \\
  --limit_students 10 \\
  --question_ids q3

python -m src.grading_tool.cli.grade \\
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \\
  --output_path data/outputs/runs/q7_prompt_v3_10students.json \\
  --run_name q7_prompt_v3_10students \\
  --prompt_name prompt_v3 \\
  --limit_students 10 \\
  --question_ids q7

python -m src.grading_tool.cli.evaluate \\
  --run_path data/outputs/runs/q7_prompt_v3_10students.json \\
  --professor_grade_path data/benchmarks/cs302_final_fall2025/professor_grade.json \\
  --output_path data/outputs/reports/q7_prompt_v3_10students_eval.json""",
        language="bash",
    )