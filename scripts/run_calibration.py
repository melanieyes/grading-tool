"""Run rubric calibration from the terminal without starting the API server.

Example:
    GEMINI_API_KEY=... python scripts/run_calibration.py \
        --benchmark data/benchmarks/cs302_midterm1_fall2025 \
        --question_id q3 \
        --max_rounds 5 \
        --output data/outputs/reports/calibration_q3.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app.schemas.api_models import (
    CalibrationRequest,
    GradeRequest,
    ProfessorGradeInput,
)
from app.services.grader_service import calibrate_rubric_rounds


def _find_one(folder: Path, needle: str) -> Path:
    matches = sorted(p for p in folder.glob("*.json") if needle in p.stem.lower())
    if not matches:
        raise FileNotFoundError(f"No *{needle}*.json in {folder}")
    if len(matches) > 1:
        raise ValueError(f"Ambiguous *{needle}*.json in {folder}: {[m.name for m in matches]}")
    return matches[0]


def _load_json(path: Path):
    with path.open() as f:
        return json.load(f)


def _find_question(question_bundle: dict, qid: str) -> dict:
    for q in question_bundle.get("questions", []):
        if q.get("question_id") == qid:
            return q
        for sub in q.get("subparts", []) or []:
            if sub.get("part_id") == qid:
                merged = {**q, **sub, "question_id": qid}
                return merged
    raise ValueError(f"question_id {qid!r} not found in question bundle")


def _find_rubric(rubric_bundle: dict, qid: str):
    for q in rubric_bundle.get("questions", []):
        if q.get("question_id") == qid:
            return q
        for sub in q.get("subparts", []) or []:
            if sub.get("part_id") == qid:
                return sub
    raise ValueError(f"question_id {qid!r} not found in rubric bundle")


def _find_solution(solution_bundle: dict, qid: str) -> str | None:
    for q in solution_bundle.get("questions", []):
        if q.get("question_id") == qid:
            return q.get("solution") or q.get("reference_solution")
        for sub in q.get("subparts", []) or []:
            if sub.get("part_id") == qid:
                return sub.get("solution") or sub.get("reference_solution")
    return None


def _collect_submissions(answers: list[dict], qid: str) -> list[GradeRequest]:
    out: list[GradeRequest] = []
    for record in answers:
        student_id = record.get("student_id")
        for ans in record.get("answers", []):
            if ans.get("question_id") == qid:
                out.append(
                    GradeRequest(
                        student_id=student_id,
                        question_id=qid,
                        answer=ans.get("student_answer", ""),
                    )
                )
                break
    return out


def _collect_professor_grades(grades: list[dict], qid: str) -> list[ProfessorGradeInput]:
    out: list[ProfessorGradeInput] = []
    for record in grades:
        student_id = record.get("student_id")
        for g in record.get("grades", []):
            if g.get("question_id") == qid:
                out.append(
                    ProfessorGradeInput(
                        student_id=student_id,
                        question_id=qid,
                        score=float(g.get("score", 0)),
                        max_score=float(g.get("score_max", g.get("max_score", 10))),
                        comment=g.get("comment"),
                    )
                )
                break
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Run rubric calibration locally.")
    parser.add_argument("--benchmark", required=True, help="Path to a benchmark folder.")
    parser.add_argument("--question_id", required=True, help="Question or subpart id, e.g. q3 or q4i.")
    parser.add_argument("--max_rounds", type=int, default=5)
    parser.add_argument("--difference_threshold", type=float, default=0.5)
    parser.add_argument("--target_mse", type=float, default=None)
    parser.add_argument("--min_improvement", type=float, default=0.01)
    parser.add_argument("--no_semantic", action="store_true", help="Skip semantic metrics.")
    parser.add_argument("--limit", type=int, default=None, help="Cap number of submissions (debugging).")
    parser.add_argument("--output", default=None, help="Output JSON path.")
    args = parser.parse_args()

    if not os.environ.get("GEMINI_API_KEY"):
        print("WARNING: GEMINI_API_KEY is not set; grading will fall back to the rule-based scorer.", file=sys.stderr)

    folder = Path(args.benchmark).resolve()
    if not folder.is_dir():
        raise SystemExit(f"Benchmark folder not found: {folder}")

    question_bundle = _load_json(_find_one(folder, "question"))
    rubric_bundle = _load_json(_find_one(folder, "rubric"))
    solution_bundle = _load_json(_find_one(folder, "solution"))
    answers = _load_json(_find_one(folder, "answer"))
    professor = _load_json(_find_one(folder, "professor_grade"))

    qid = args.question_id
    question_node = _find_question(question_bundle, qid)
    rubric_node = _find_rubric(rubric_bundle, qid)
    solution_text = _find_solution(solution_bundle, qid)

    submissions = _collect_submissions(answers, qid)
    professor_grades = _collect_professor_grades(professor, qid)

    if not submissions:
        raise SystemExit(f"No student answers found for {qid}")
    if not professor_grades:
        raise SystemExit(f"No professor grades found for {qid}")

    if args.limit:
        submissions = submissions[: args.limit]
        ids = {s.student_id for s in submissions}
        professor_grades = [g for g in professor_grades if g.student_id in ids]

    benchmark_type = question_node.get("benchmark_type") or rubric_node.get("benchmark_type") or "short_answer"
    for s in submissions:
        s.benchmark_type = benchmark_type
        s.question_text = question_node.get("question_text")
        s.reference_solution = solution_text

    request = CalibrationRequest(
        question_id=qid,
        question_text=question_node.get("question_text"),
        original_rubric=rubric_node,
        solution=solution_text,
        submissions=submissions,
        professor_grades=professor_grades,
        max_rounds=args.max_rounds,
        difference_threshold=args.difference_threshold,
        target_mse=args.target_mse,
        min_improvement=args.min_improvement,
        include_semantic_metrics=not args.no_semantic,
    )

    print(f"Calibrating {qid} on {len(submissions)} submissions for up to {args.max_rounds} rounds...")
    response = calibrate_rubric_rounds(request, api_key=os.environ.get("GEMINI_API_KEY"))

    payload = response.model_dump()
    output_path = Path(args.output) if args.output else (
        REPO_ROOT / "data" / "outputs" / "reports" / f"calibration_{folder.name}_{qid}.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        json.dump(payload, f, indent=2)

    print(f"Saved calibration result to: {output_path}")
    print(f"Completed rounds: {payload['completed_rounds']} / {payload['max_rounds']}")
    print(f"Best round: {payload['best_round_index']}  best MSE: {payload['best_mse']}")
    print(f"Stopping reason: {payload['stopping_reason']}")


if __name__ == "__main__":
    main()
