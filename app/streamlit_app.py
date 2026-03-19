from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st


st.set_page_config(
    page_title="Grading tool for CS302 Algorithms and Theory of Computing",
    page_icon="📝",
    layout="wide",
)


RESULTS_PATH = Path("data/outputs/graded_q9_results.json")
CSV_PATH = Path("data/outputs/graded_q9_summary.csv")


@st.cache_data
def load_results() -> list[dict]:
    if not RESULTS_PATH.exists():
        return []
    with open(RESULTS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@st.cache_data
def build_summary_df(results: list[dict]) -> pd.DataFrame:
    rows = []
    for row in results:
        avg_conf = sum(
            part["confidence"] for part in row["subparts"].values()
        ) / len(row["subparts"])

        rows.append(
            {
                "student_id": row["student_id"],
                "question_id": row["question_id"],
                "total_score": row["total_score"],
                "max_score": row["max_score"],
                "avg_confidence": round(avg_conf, 3),
                "a": row["subparts"]["a"]["score"],
                "b": row["subparts"]["b"]["score"],
                "c": row["subparts"]["c"]["score"],
                "d": row["subparts"]["d"]["score"],
                "e": row["subparts"]["e"]["score"],
                "f": row["subparts"]["f"]["score"],
                "g": row["subparts"]["g"]["score"],
                "h": row["subparts"]["h"]["score"],
            }
        )

    return pd.DataFrame(rows)


def render_subpart_card(subpart_key: str, subpart_result: dict) -> None:
    st.markdown(f"### Part {subpart_key}")

    c1, c2, c3 = st.columns(3)
    c1.metric("Score", subpart_result["score"])
    c2.metric("Confidence", round(float(subpart_result["confidence"]), 3))
    c3.metric("Method", subpart_result["grading_method"])

    st.write(f"Status: {subpart_result['status']}")
    st.write(f"Reasoning: {subpart_result['reasoning_summary']}")
    st.write(f"Feedback: {subpart_result['feedback']}")

    with st.expander(f"Details for part {subpart_key}", expanded=False):
        st.write("Normalized student answer:")
        st.code(subpart_result["normalized_student_answer"] or "(empty)")

        st.write("Normalized reference answer:")
        st.code(subpart_result["normalized_reference_answer"] or "(none)")

        st.write("False positives:")
        st.json(subpart_result["false_positives"])

        st.write("False negatives:")
        st.json(subpart_result["false_negatives"])

        st.write("Notes:")
        st.json(subpart_result["notes"])


def main() -> None:
    st.title("Grading tool for CS302 Algorithms and Theory of Computing")
    st.caption("Hybrid deterministic + Gemini fallback grading")

    if not RESULTS_PATH.exists():
        st.warning("No grading results found yet. Run: python -m src.run_batch")
        return

    results = load_results()

    if not results:
        st.warning("Results file is empty.")
        return

    summary_df = build_summary_df(results)

    with st.sidebar:
        st.header("Controls")
        student_ids = [row["student_id"] for row in results]
        selected_student = st.selectbox("Choose a student", student_ids)

        st.divider()

        st.write("Files")
        st.write(f"JSON: {RESULTS_PATH}")
        if CSV_PATH.exists():
            st.write(f"CSV: {CSV_PATH}")

    st.subheader("Batch Summary")
    st.dataframe(summary_df, use_container_width=True)

    st.divider()

    selected_row = next(row for row in results if row["student_id"] == selected_student)

    st.subheader(f"Student Detail: {selected_student}")

    col1, col2, col3 = st.columns(3)
    col1.metric("Total Score", f"{selected_row['total_score']}/{selected_row['max_score']}")
    col2.metric(
        "Average Confidence",
        round(
            sum(part["confidence"] for part in selected_row["subparts"].values())
            / len(selected_row["subparts"]),
            3,
        ),
    )
    col3.metric(
        "LLM-used parts",
        sum(
            1
            for part in selected_row["subparts"].values()
            if part["grading_method"] == "llm_fallback"
        ),
    )

    for subpart_key in ["a", "b", "c", "d", "e", "f", "g", "h"]:
        render_subpart_card(subpart_key, selected_row["subparts"][subpart_key])
        st.divider()


if __name__ == "__main__":
    main()