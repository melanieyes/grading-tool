from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st

st.set_page_config(page_title="Grading Tool Dashboard", layout="wide")


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = PROJECT_ROOT / "data" / "outputs" / "reports"
RUN_DIR = PROJECT_ROOT / "data" / "outputs" / "runs"


def load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


st.title("Grading Tool Dashboard")
st.caption("Rubric-based grading experiments compared against professor scores")

st.markdown(
    """
Welcome. This dashboard lets you inspect:

- saved grading runs
- evaluation reports
- prompt comparisons
- per-question performance

Use the **sidebar** to open the page:

- `prompt_comparison`
"""
)

run_files = sorted(RUN_DIR.glob("*.json"))
report_files = sorted(REPORT_DIR.glob("*_eval.json"))

a, b, c = st.columns(3)
with a:
    st.metric("Saved Runs", len(run_files))
with b:
    st.metric("Saved Eval Reports", len(report_files))
with c:
    st.metric("Latest Eval", report_files[-1].name if report_files else "—")

st.markdown("---")

st.subheader("Recent Evaluation Reports")

if not report_files:
    st.warning("No evaluation reports found yet.")
else:
    rows = []
    for path in report_files[-8:]:
        report = load_json(path)
        rows.append(
            {
                "file": path.name,
                "run_name": report.get("run_name"),
                "prompt_name": report.get("prompt_name"),
                "mae": report.get("mae"),
                "mse": report.get("mse"),
                "exact_match_rate": report.get("exact_match_rate"),
                "bertscore_f1": report.get("bertscore_f1"),
                "average_cosine_similarity": report.get("average_cosine_similarity"),
                "n_graded": report.get("n_graded"),
            }
        )

    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True)

st.markdown("---")

with st.expander("CLI examples"):
    st.code(
        """python -m src.grading_tool.cli.grade \\
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \\
  --output_path data/outputs/runs/first5_prompt_v3_v2.json \\
  --run_name first5_prompt_v3_v2 \\
  --prompt_name prompt_v3 \\
  --limit_students 5

python -m src.grading_tool.cli.evaluate \\
  --run_path data/outputs/runs/first5_prompt_v3_v2.json \\
  --professor_grade_path data/benchmarks/cs302_final_fall2025/professor_grade.json \\
  --output_path data/outputs/reports/first5_prompt_v3_v2_eval.json""",
        language="bash",
    )