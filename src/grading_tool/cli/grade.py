from __future__ import annotations

import argparse
import asyncio

from src.grading_tool.grading.orchestrator import run_grading, run_grading_async


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run rubric-based grading on a benchmark. Supports flexible JSON filenames and multiple answer files."
    )
    parser.add_argument(
        "--benchmark_dir",
        default="data/benchmarks/cs302_final_fall2025",
        help="Directory containing benchmark JSON files (question/rubric/answers/solution).",
    )
    parser.add_argument(
        "--manifest_path",
        default=None,
        help="Optional path to benchmark manifest JSON. If omitted, benchmark_manifest.json in benchmark_dir is auto-used when present.",
    )
    parser.add_argument(
        "--question_path",
        default=None,
        help="Optional explicit path to question JSON file.",
    )
    parser.add_argument(
        "--rubric_path",
        default=None,
        help="Optional explicit path to rubric JSON file.",
    )
    parser.add_argument(
        "--solutions_path",
        default=None,
        help="Optional explicit path to solutions JSON file.",
    )
    parser.add_argument(
        "--student_answers_paths",
        nargs="+",
        default=None,
        help="Optional list of student answer JSON paths. If omitted, auto-discovers answer files in benchmark_dir.",
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
    parser.add_argument(
        "--question_ids",
        nargs="+",
        default=None,
        help="Optional specific question IDs to grade, e.g. q7 q8",
    )

    parser.add_argument(
        "--max_concurrency",
        type=int,
        default=1,
        help="Max number of concurrent grading requests (async worker pool). Use 5 for ~5 in-flight Gemini calls.",
    )
    parser.add_argument(
        "--max_retries",
        type=int,
        default=5,
        help="Max retries per question on transient failures (rate limits, JSON parse errors).",
    )
    parser.add_argument(
        "--retry_base_delay",
        type=float,
        default=1.0,
        help="Base delay (seconds) for exponential backoff retries.",
    )
    parser.add_argument(
        "--retry_max_delay",
        type=float,
        default=30.0,
        help="Max delay (seconds) between retries.",
    )

    args = parser.parse_args()

    if args.max_concurrency and args.max_concurrency > 1:
        payload = asyncio.run(
            run_grading_async(
                benchmark_dir=args.benchmark_dir,
                output_path=args.output_path,
                run_name=args.run_name,
                prompt_name=args.prompt_name,
                model_name=args.model_name,
                limit_students=args.limit_students,
                limit_questions=args.limit_questions,
                question_ids=args.question_ids,
                question_path=args.question_path,
                rubric_path=args.rubric_path,
                solutions_path=args.solutions_path,
                student_answers_paths=args.student_answers_paths,
                manifest_path=args.manifest_path,
                show_progress=True,
                max_concurrency=args.max_concurrency,
                max_retries=args.max_retries,
                retry_base_delay=args.retry_base_delay,
                retry_max_delay=args.retry_max_delay,
            )
        )
    else:
        payload = run_grading(
            benchmark_dir=args.benchmark_dir,
            output_path=args.output_path,
            run_name=args.run_name,
            prompt_name=args.prompt_name,
            model_name=args.model_name,
            limit_students=args.limit_students,
            limit_questions=args.limit_questions,
            question_ids=args.question_ids,
            question_path=args.question_path,
            rubric_path=args.rubric_path,
            solutions_path=args.solutions_path,
            student_answers_paths=args.student_answers_paths,
            manifest_path=args.manifest_path,
        )

    print(f"Saved grading run to: {args.output_path}")
    print(f"Run name: {payload['run_name']}")
    print(f"Prompt name: {payload['prompt_name']}")
    print(f"Number of graded results: {payload['n_results']}")
    print(f"Number skipped: {payload['n_skipped']}")


if __name__ == "__main__":
    main()