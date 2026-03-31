from __future__ import annotations

import json
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

st.set_page_config(page_title="Prompt Comparison", layout="wide")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = PROJECT_ROOT / "data" / "outputs" / "reports"

QUESTION_TYPE_MAP = {
    "q2b": "true_false_with_explanation",
    "q2c": "true_false_with_explanation",
    "q2e": "true_false_with_explanation",
    "q2f": "true_false_with_explanation",
    "q2g": "true_false_with_explanation",
    "q2h": "true_false_with_explanation",
    "q3": "np_membership_proof",
    "q4": "np_membership_proof",
    "q7": "polynomial_reduction",
    "q8": "np_completeness_proof",
}

TYPE_LABELS = {
    "true_false_with_explanation": "T/F + explanation",
    "np_membership_proof": "NP membership proof",
    "polynomial_reduction": "Polynomial reduction",
    "np_completeness_proof": "NP-completeness proof",
}


@st.cache_data
def load_eval(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@st.cache_data
def collect_reports(report_dir: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    report_dir = Path(report_dir)
    eval_files = sorted(report_dir.glob("*_eval.json"))

    overall_rows = []
    per_question_rows = []

    for path in eval_files:
        report = load_eval(path)
        run_name = report.get("run_name", path.stem)
        prompt_name = report.get("prompt_name", "unknown")

        overall_rows.append(
            {
                "file": path.name,
                "run_name": run_name,
                "prompt_name": prompt_name,
                "mae": report.get("mae", 0.0),
                "mse": report.get("mse", 0.0),
                "exact_match_rate": report.get("exact_match_rate", 0.0),
                "pearson_correlation": report.get("pearson_correlation", 0.0),
                "spearman_correlation": report.get("spearman_correlation", 0.0),
                "bertscore_f1": report.get("bertscore_f1"),
                "average_cosine_similarity": report.get("average_cosine_similarity"),
                "n_graded": report.get("n_graded", 0),
            }
        )

        for row in report.get("per_question", []):
            qid = row["question_id"]
            per_question_rows.append(
                {
                    "run_name": run_name,
                    "prompt_name": prompt_name,
                    "question_id": qid,
                    "question_type": QUESTION_TYPE_MAP.get(qid, "unknown"),
                    "question_type_label": TYPE_LABELS.get(QUESTION_TYPE_MAP.get(qid, "unknown"), "Unknown"),
                    "mae": row.get("mae", 0.0),
                    "mse": row.get("mse", 0.0),
                    "exact_match_rate": row.get("exact_match_rate", 0.0),
                    "n": row.get("n", 0),
                }
            )

    return pd.DataFrame(overall_rows), pd.DataFrame(per_question_rows)


def best_row(df: pd.DataFrame, column: str, mode: str = "min"):
    if df.empty or column not in df.columns:
        return None
    s = df[column].dropna()
    if s.empty:
        return None
    target = s.min() if mode == "min" else s.max()
    return df.loc[df[column] == target].iloc[0]


st.markdown(
    """
    <style>
    .hero {
        padding: 1rem 1.2rem;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(80,120,255,0.18), rgba(0,200,170,0.12));
        border: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 1rem;
    }
    .mini-card {
        padding: 0.8rem 1rem;
        border-radius: 16px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
    }
    .badge {
        display: inline-block;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 600;
        background: rgba(0, 200, 140, 0.15);
        border: 1px solid rgba(0, 200, 140, 0.35);
        margin-right: 0.4rem;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown(
    """
    <div class="hero">
        <h1 style="margin-bottom:0.25rem;">Prompt Comparison Dashboard</h1>
        <div style="opacity:0.9;">
            Compare grading prompts against professor scores using score alignment and semantic similarity.
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

overall_df, per_question_df = collect_reports(str(REPORT_DIR))

if overall_df.empty:
    st.warning("No evaluation reports found in data/outputs/reports/")
    st.stop()

st.sidebar.header("Filters")
prompt_options = sorted(overall_df["prompt_name"].dropna().unique().tolist())
selected_prompts = st.sidebar.multiselect(
    "Prompt versions",
    options=prompt_options,
    default=prompt_options,
)

filtered_overall = overall_df[overall_df["prompt_name"].isin(selected_prompts)].copy()
filtered_per_question = per_question_df[per_question_df["prompt_name"].isin(selected_prompts)].copy()

if filtered_overall.empty:
    st.warning("No reports match the selected prompts.")
    st.stop()

best_mae = best_row(filtered_overall, "mae", "min")
best_exact = best_row(filtered_overall, "exact_match_rate", "max")
best_bert = best_row(filtered_overall, "bertscore_f1", "max")
best_cos = best_row(filtered_overall, "average_cosine_similarity", "max")

c1, c2, c3, c4 = st.columns(4)
with c1:
    st.metric("Best MAE", f"{best_mae['mae']:.4f}" if best_mae is not None else "—", best_mae["prompt_name"] if best_mae is not None else "")
with c2:
    st.metric("Best Exact Match", f"{best_exact['exact_match_rate']:.4f}" if best_exact is not None else "—", best_exact["prompt_name"] if best_exact is not None else "")
with c3:
    st.metric("Best BERTScore", f"{best_bert['bertscore_f1']:.4f}" if best_bert is not None and pd.notna(best_bert["bertscore_f1"]) else "—", best_bert["prompt_name"] if best_bert is not None and pd.notna(best_bert["bertscore_f1"]) else "")
with c4:
    st.metric("Best Cosine", f"{best_cos['average_cosine_similarity']:.4f}" if best_cos is not None and pd.notna(best_cos["average_cosine_similarity"]) else "—", best_cos["prompt_name"] if best_cos is not None and pd.notna(best_cos["average_cosine_similarity"]) else "")

st.markdown("### Quick Highlights")
badges = []
if best_mae is not None:
    badges.append(f"<span class='badge'>Lowest MAE: {best_mae['prompt_name']}</span>")
if best_exact is not None:
    badges.append(f"<span class='badge'>Best Exact Match: {best_exact['prompt_name']}</span>")
if best_bert is not None and pd.notna(best_bert["bertscore_f1"]):
    badges.append(f"<span class='badge'>Best BERTScore: {best_bert['prompt_name']}</span>")
if best_cos is not None and pd.notna(best_cos["average_cosine_similarity"]):
    badges.append(f"<span class='badge'>Best Cosine: {best_cos['prompt_name']}</span>")
st.markdown(" ".join(badges), unsafe_allow_html=True)

st.markdown("---")

st.subheader("Prompt Leaderboard")
leaderboard = filtered_overall.sort_values(by=["mae", "exact_match_rate"], ascending=[True, False]).reset_index(drop=True)
st.dataframe(
    leaderboard[
        [
            "prompt_name",
            "run_name",
            "mae",
            "mse",
            "exact_match_rate",
            "pearson_correlation",
            "spearman_correlation",
            "bertscore_f1",
            "average_cosine_similarity",
            "n_graded",
        ]
    ].style.format(
        {
            "mae": "{:.4f}",
            "mse": "{:.4f}",
            "exact_match_rate": "{:.4f}",
            "pearson_correlation": "{:.4f}",
            "spearman_correlation": "{:.4f}",
            "bertscore_f1": "{:.4f}",
            "average_cosine_similarity": "{:.4f}",
        }
    ),
    use_container_width=True,
    hide_index=True,
)

left, right = st.columns(2)
with left:
    mae_chart = (
        alt.Chart(filtered_overall)
        .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
        .encode(
            x=alt.X("prompt_name:N", title="Prompt"),
            y=alt.Y("mae:Q", title="MAE"),
            tooltip=["prompt_name", "run_name", "mae", "n_graded"],
        )
        .properties(height=320)
    )
    st.altair_chart(mae_chart, use_container_width=True)

with right:
    exact_chart = (
        alt.Chart(filtered_overall)
        .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
        .encode(
            x=alt.X("prompt_name:N", title="Prompt"),
            y=alt.Y("exact_match_rate:Q", title="Exact Match Rate"),
            tooltip=["prompt_name", "run_name", "exact_match_rate", "n_graded"],
        )
        .properties(height=320)
    )
    st.altair_chart(exact_chart, use_container_width=True)

left2, right2 = st.columns(2)
with left2:
    corr_df = filtered_overall.melt(
        id_vars=["prompt_name", "run_name"],
        value_vars=["pearson_correlation", "spearman_correlation"],
        var_name="metric",
        value_name="value",
    )
    corr_chart = (
        alt.Chart(corr_df)
        .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
        .encode(
            x=alt.X("prompt_name:N", title="Prompt"),
            y=alt.Y("value:Q", title="Correlation"),
            color=alt.Color("metric:N", title="Metric"),
            xOffset="metric:N",
            tooltip=["prompt_name", "metric", "value"],
        )
        .properties(height=320)
    )
    st.altair_chart(corr_chart, use_container_width=True)

with right2:
    semantic_cols = [c for c in ["bertscore_f1", "average_cosine_similarity"] if c in filtered_overall.columns]
    semantic_df = filtered_overall.melt(
        id_vars=["prompt_name", "run_name"],
        value_vars=semantic_cols,
        var_name="metric",
        value_name="value",
    ).dropna()
    if semantic_df.empty:
        st.info("No semantic metrics available yet.")
    else:
        semantic_chart = (
            alt.Chart(semantic_df)
            .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
            .encode(
                x=alt.X("prompt_name:N", title="Prompt"),
                y=alt.Y("value:Q", title="Semantic Similarity"),
                color=alt.Color("metric:N", title="Metric"),
                xOffset="metric:N",
                tooltip=["prompt_name", "metric", "value"],
            )
            .properties(height=320)
        )
        st.altair_chart(semantic_chart, use_container_width=True)

st.markdown("---")

st.subheader("Per-Question Diagnostics")

question_ids = sorted(filtered_per_question["question_id"].unique().tolist())
selected_questions = st.multiselect("Select questions", options=question_ids, default=question_ids)

pq = filtered_per_question[filtered_per_question["question_id"].isin(selected_questions)].copy()

left3, right3 = st.columns(2)
with left3:
    pq_mae_chart = (
        alt.Chart(pq)
        .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
        .encode(
            x=alt.X("question_id:N", title="Question"),
            y=alt.Y("mae:Q", title="Per-question MAE"),
            color=alt.Color("prompt_name:N", title="Prompt"),
            xOffset="prompt_name:N",
            tooltip=["question_id", "prompt_name", "mae", "n"],
        )
        .properties(height=400)
    )
    st.altair_chart(pq_mae_chart, use_container_width=True)

with right3:
    pq_exact_chart = (
        alt.Chart(pq)
        .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
        .encode(
            x=alt.X("question_id:N", title="Question"),
            y=alt.Y("exact_match_rate:Q", title="Per-question Exact Match"),
            color=alt.Color("prompt_name:N", title="Prompt"),
            xOffset="prompt_name:N",
            tooltip=["question_id", "prompt_name", "exact_match_rate", "n"],
        )
        .properties(height=400)
    )
    st.altair_chart(pq_exact_chart, use_container_width=True)

st.markdown("---")

st.subheader("Grouped by Reasoning Type")

type_summary = (
    filtered_per_question.groupby(["prompt_name", "question_type_label"], as_index=False)
    .agg(
        avg_mae=("mae", "mean"),
        avg_exact=("exact_match_rate", "mean"),
        total_n=("n", "sum"),
    )
)

l4, r4 = st.columns(2)

with l4:
    type_mae_chart = (
        alt.Chart(type_summary)
        .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
        .encode(
            x=alt.X("question_type_label:N", title="Reasoning Type"),
            y=alt.Y("avg_mae:Q", title="Average MAE"),
            color=alt.Color("prompt_name:N", title="Prompt"),
            xOffset="prompt_name:N",
            tooltip=["question_type_label", "prompt_name", "avg_mae", "total_n"],
        )
        .properties(height=380)
    )
    st.altair_chart(type_mae_chart, use_container_width=True)

with r4:
    type_exact_chart = (
        alt.Chart(type_summary)
        .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
        .encode(
            x=alt.X("question_type_label:N", title="Reasoning Type"),
            y=alt.Y("avg_exact:Q", title="Average Exact Match"),
            color=alt.Color("prompt_name:N", title="Prompt"),
            xOffset="prompt_name:N",
            tooltip=["question_type_label", "prompt_name", "avg_exact", "total_n"],
        )
        .properties(height=380)
    )
    st.altair_chart(type_exact_chart, use_container_width=True)

st.dataframe(
    type_summary.sort_values(["question_type_label", "avg_mae"]).style.format(
        {"avg_mae": "{:.4f}", "avg_exact": "{:.4f}"}
    ),
    use_container_width=True,
    hide_index=True,
)


st.markdown("---")

st.subheader("Where the Tool Performs Well vs Poorly")

agg_q = (
    pq.groupby(["question_id", "question_type_label"], as_index=False)
    .agg(
        avg_mae=("mae", "mean"),
        avg_exact=("exact_match_rate", "mean"),
        total_n=("n", "sum"),
    )
)

e1, e2 = st.columns(2)
with e1:
    st.markdown("**Easiest Questions**")
    st.dataframe(
        agg_q.sort_values("avg_mae", ascending=True).head(5).style.format(
            {"avg_mae": "{:.4f}", "avg_exact": "{:.4f}"}
        ),
        use_container_width=True,
        hide_index=True,
    )

with e2:
    st.markdown("**Hardest Questions**")
    st.dataframe(
        agg_q.sort_values("avg_mae", ascending=False).head(5).style.format(
            {"avg_mae": "{:.4f}", "avg_exact": "{:.4f}"}
        ),
        use_container_width=True,
        hide_index=True,
    )

st.info(
    "Lower MAE and MSE are better. Higher exact match, correlation, BERTScore, and cosine similarity are better. "
    "The reasoning-type view helps identify which categories the grading tool handles well and which remain difficult."
)