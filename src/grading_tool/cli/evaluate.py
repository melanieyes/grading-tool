from __future__ import annotations

import argparse

from src.grading_tool.utils.io import load_json, save_json
from src.grading_tool.evaluation.agreement import evaluate_run


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a grading run against professor scores.")
    parser.add_argument(
        "--run_path",
        default="data/outputs/runs/baseline_run.json",
        help="Path to saved grading run JSON",
    )
    parser.add_argument(
        "--professor_grade_path",
        default="data/benchmarks/cs302_final_fall2025/professor_grade.json",
        help="Path to professor grade JSON",
    )
    parser.add_argument(
        "--output_path",
        default="data/outputs/reports/baseline_eval.json",
        help="Where to save the evaluation report JSON",
    )

    args = parser.parse_args()

    run_payload = load_json(args.run_path)
    professor_grade_file = load_json(args.professor_grade_path)

    report = evaluate_run(run_payload, professor_grade_file)
    save_json(args.output_path, report)

    print(f"Saved evaluation report to: {args.output_path}")
    print(f"Run name: {report['run_name']}")
    print(f"N graded: {report['n_graded']}")
    print(f"MAE: {report['mae']:.4f}")
    print(f"Exact match rate: {report['exact_match_rate']:.4f}")
    print(f"Pearson correlation: {report['pearson_correlation']:.4f}")
    print(f"Spearman correlation: {report['spearman_correlation']:.4f}")


if __name__ == "__main__":
    main()