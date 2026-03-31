from __future__ import annotations

import argparse

from src.grading_tool.grading.orchestrator import run_grading


def main() -> None:
    parser = argparse.ArgumentParser(description="Run rubric-based grading on a benchmark.")
    parser.add_argument(
        "--benchmark_dir",
        default="data/benchmarks/cs302_final_fall2025",
        help="Directory containing question_final.json, final_rubric.json, final_student_answers.json, and solutions_final.json",
    )
    parser.add_argument(
        "--output_path",
        default="data/outputs/runs/baseline_run.json",
        help="Where to save the grading run JSON",
    )
    parser.add_argument(
        "--run_name",
        default="baseline_run",
        help="Experiment/run name",
    )
    parser.add_argument(
        "--prompt_name",
        default="prompt_v1",
        help="Prompt version name from configs/prompts.yaml",
    )
    parser.add_argument(
        "--model_name",
        default=None,
        help="Optional Gemini model override, e.g. gemini-2.5-pro",
    )
    parser.add_argument(
        "--limit_students",
        type=int,
        default=None,
        help="Optional debug limit on number of students",
    )
    parser.add_argument(
        "--limit_questions",
        type=int,
        default=None,
        help="Optional debug limit on number of questions per student",
    )

    args = parser.parse_args()

    payload = run_grading(
        benchmark_dir=args.benchmark_dir,
        output_path=args.output_path,
        run_name=args.run_name,
        prompt_name=args.prompt_name,
        model_name=args.model_name,
        limit_students=args.limit_students,
        limit_questions=args.limit_questions,
    )

    print(f"Saved grading run to: {args.output_path}")
    print(f"Run name: {payload['run_name']}")
    print(f"Prompt name: {payload['prompt_name']}")
    print(f"Number of graded results: {payload['n_results']}")
    print(f"Number skipped: {payload['n_skipped']}")


if __name__ == "__main__":
    main()