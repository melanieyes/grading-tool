from __future__ import annotations

import argparse
from pathlib import Path

from src.grading_tool.utils.io import load_json, save_json
from src.grading_tool.evaluation.agreement import evaluate_run


def _resolve_professor_grade_path(
    run_payload: dict,
    explicit_path: str | None,
) -> Path:
    if explicit_path:
        path = Path(explicit_path)
        if not path.exists():
            raise FileNotFoundError(f"Professor grade file not found: {path}")
        return path

    run_payload_professor_path = run_payload.get("professor_grade_path")
    if run_payload_professor_path:
        path = Path(run_payload_professor_path)
        if path.exists():
            return path

    benchmark_dir = run_payload.get("benchmark_dir")
    if not benchmark_dir:
        raise ValueError(
            "run payload does not include benchmark_dir; pass --professor_grade_path explicitly"
        )

    benchmark_path = Path(benchmark_dir)
    candidates = sorted(
        p
        for p in benchmark_path.glob("*.json")
        if "professor_grade" in p.stem.lower()
    )
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise FileNotFoundError(
            f"No professor grade JSON found in {benchmark_path}; pass --professor_grade_path"
        )
    names = [p.name for p in candidates]
    raise ValueError(
        f"Multiple professor grade JSON files found in {benchmark_path}: {names}. "
        "Please pass --professor_grade_path."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a grading run against professor scores.")
    parser.add_argument(
        "--run_path",
        default="data/outputs/runs/baseline_run.json",
        help="Path to saved grading run JSON",
    )
    parser.add_argument(
        "--professor_grade_path",
        default=None,
        help="Optional path to professor grade JSON. If omitted, auto-discovers professor_grade*.json in run benchmark_dir.",
    )
    parser.add_argument(
        "--output_path",
        default="data/outputs/reports/baseline_eval.json",
        help="Where to save the evaluation report JSON",
    )

    args = parser.parse_args()

    run_payload = load_json(args.run_path)
    professor_grade_path = _resolve_professor_grade_path(
        run_payload=run_payload,
        explicit_path=args.professor_grade_path,
    )
    professor_grade_file = load_json(professor_grade_path)

    report = evaluate_run(run_payload, professor_grade_file)
    save_json(args.output_path, report)

    print(f"Saved evaluation report to: {args.output_path}")
    print(f"Run name: {report['run_name']}")
    print(f"Professor grade path: {professor_grade_path}")
    print(f"N graded: {report['n_graded']}")
    print(f"MAE: {report['mae']:.4f}")
    print(f"Exact match rate: {report['exact_match_rate']:.4f}")
    print(f"Pearson correlation: {report['pearson_correlation']:.4f}")
    print(f"Spearman correlation: {report['spearman_correlation']:.4f}")


if __name__ == "__main__":
    main()