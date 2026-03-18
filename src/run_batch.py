from __future__ import annotations

import csv
import json
from pathlib import Path

from src.pipeline import run_q9_grading_pipeline


def main() -> None:
    results = run_q9_grading_pipeline()

    output_dir = Path("data/outputs")
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / "graded_q9_results.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    csv_path = output_dir / "graded_q9_summary.csv"
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "student_id", "question_id", "total_score", "max_score",
            "a", "b", "c", "d", "e", "f", "g", "h"
        ])

        for row in results:
            writer.writerow([
                row["student_id"],
                row["question_id"],
                row["total_score"],
                row["max_score"],
                row["subparts"]["a"]["score"],
                row["subparts"]["b"]["score"],
                row["subparts"]["c"]["score"],
                row["subparts"]["d"]["score"],
                row["subparts"]["e"]["score"],
                row["subparts"]["f"]["score"],
                row["subparts"]["g"]["score"],
                row["subparts"]["h"]["score"],
            ])

    print(f"Saved JSON results to: {json_path}")
    print(f"Saved CSV summary to: {csv_path}")

    for row in results:
        avg_conf = sum(
            part["confidence"] for part in row["subparts"].values()
        ) / len(row["subparts"])
        print(f"{row['student_id']}: {row['total_score']}/{row['max_score']} | avg_confidence={avg_conf:.2f}")


if __name__ == "__main__":
    main()