"""
Run rubric calibration separately for each representative question in the
synthesis benchmark, firing one API call per question with only that
question's students.

Usage:
    python scripts/run_calibration_all_questions.py [--api_url URL] [--max_rounds N] [--output_dir DIR] [--max_students_per_question N]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests


BENCHMARK_DIR = Path("data/benchmarks/synthesis")
DEFAULT_API_URL = "http://localhost:8000/api/evaluation/calibrate"
DEFAULT_OUTPUT_DIR = Path("data/outputs/calibration")


def load_json(path: Path) -> dict | list:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_question_index(question_file: dict) -> dict[str, dict]:
    return {q["question_id"]: q for q in question_file["questions"]}


def build_rubric_index(rubric_file: dict) -> dict[str, dict]:
    index = {}
    for q in rubric_file["questions"]:
        qid = q["question_id"]
        index[qid] = {
            "criteria": q.get("criteria", []),
            "grading_note": q.get("grading_note"),
            "total_points": float(q.get("total_points", 0)),
        }
    return index


def build_solution_index(solution_file: dict) -> dict[str, str]:
    return {q["question_id"]: q.get("solution", "") for q in solution_file["questions"]}


def build_submissions_index(student_answers: list[dict]) -> dict[str, list[dict]]:
    """Map question_id → list of {student_id, question_id, answer}."""
    index: dict[str, list[dict]] = {}
    for student in student_answers:
        sid = student["student_id"]
        for ans in student.get("answers", []):
            qid = ans["question_id"]
            index.setdefault(qid, []).append(
                {
                    "student_id": sid,
                    "question_id": qid,
                    "answer": ans.get("student_answer", ""),
                }
            )
    return index


def build_professor_index(prof_grades: list[dict]) -> dict[str, list[dict]]:
    """Map question_id → list of {student_id, question_id, score, max_score, comment}."""
    index: dict[str, list[dict]] = {}
    for student in prof_grades:
        sid = student["student_id"]
        for grade in student.get("grades", []):
            qid = grade["question_id"]
            index.setdefault(qid, []).append(
                {
                    "student_id": sid,
                    "question_id": qid,
                    "score": grade["score"],
                    # Benchmark professor-grade JSON uses score_max; API expects max_score.
                    "max_score": grade.get("score_max")
                    or grade.get("max_score")
                    or grade.get("total_points")
                    or 0,
                    "comment": grade.get("comment", ""),
                }
            )
    return index


def _align_and_cap(
    submissions: list[dict],
    professor_grades: list[dict],
    *,
    max_students: int | None,
) -> tuple[list[dict], list[dict]]:
    """Ensure we only send students that have both submission and professor grade.

    Also optionally cap to the first N students (sorted by student_id for determinism).
    """
    if not submissions or not professor_grades:
        return [], []

    sub_by_student = {row.get("student_id"): row for row in submissions if row.get("student_id")}
    prof_by_student = {row.get("student_id"): row for row in professor_grades if row.get("student_id")}

    common_students = sorted(set(sub_by_student.keys()) & set(prof_by_student.keys()))

    if max_students is not None and max_students > 0:
        common_students = common_students[:max_students]

    aligned_submissions = [sub_by_student[sid] for sid in common_students]
    aligned_professor = [prof_by_student[sid] for sid in common_students]

    return aligned_submissions, aligned_professor


def calibrate_question(
    *,
    question_id: str,
    question_meta: dict,
    rubric_meta: dict,
    solution: str,
    submissions: list[dict],
    professor_grades: list[dict],
    api_url: str,
    max_rounds: int,
    normalized_difference_threshold: float,
) -> dict:
    payload = {
        "question_id": question_id,
        "question_text": question_meta.get("question_text", ""),
        "benchmark_type": question_meta.get("benchmark_type", "unknown"),
        "original_rubric": {
            "criteria": rubric_meta["criteria"],
            "grading_note": rubric_meta.get("grading_note"),
        },
        "solution": solution,
        "submissions": submissions,
        "professor_grades": professor_grades,
        "max_rounds": max_rounds,
        "difference_threshold": 0.5,
        "normalized_difference_threshold": normalized_difference_threshold,
        "include_semantic_metrics": False,
    }

    print(
        f"  POST {api_url}  ({len(submissions)} submissions, {max_rounds} rounds)",
        flush=True,
    )
    resp = requests.post(api_url, json=payload, timeout=600)
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibrate all 5 representative questions.")
    parser.add_argument("--api_url", default=DEFAULT_API_URL)
    parser.add_argument("--max_rounds", type=int, default=3)
    parser.add_argument("--output_dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--max_students_per_question",
        type=int,
        default=None,
        help="Optional cap on submissions/grades per question to control cost (default: no cap)",
    )
    parser.add_argument(
        "--normalized_threshold",
        type=float,
        default=0.10,
        help="Normalized score gap that triggers recalibration (default 0.10 = 10%% of max score)",
    )
    parser.add_argument(
        "--question_ids",
        nargs="+",
        default=None,
        help="Optional subset of question IDs to calibrate (default: all 5)",
    )
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading benchmark files...", flush=True)
    question_file = load_json(BENCHMARK_DIR / "synthesis_question.json")
    question_index = build_question_index(question_file)
    rubric_index = build_rubric_index(load_json(BENCHMARK_DIR / "synthesis_rubric.json"))
    solution_index = build_solution_index(load_json(BENCHMARK_DIR / "synthesis_solution.json"))
    submissions_index = build_submissions_index(
        load_json(BENCHMARK_DIR / "synthesis_student_answers.json")
    )
    professor_index = build_professor_index(
        load_json(BENCHMARK_DIR / "synthesis_professor_grade.json")
    )

    curated_ids = (
        question_file.get("benchmark_notes", {})
        .get("question_ids", [])
    )
    question_ids = args.question_ids or curated_ids or sorted(question_index.keys())
    summary = []

    for i, qid in enumerate(question_ids, 1):
        print(f"\n[{i}/{len(question_ids)}] Calibrating {qid}...", flush=True)

        if qid not in question_index:
            print(f"  SKIP — question_id '{qid}' not found in question file.", flush=True)
            continue

        submissions = submissions_index.get(qid, [])
        professor_grades = professor_index.get(qid, [])

        submissions, professor_grades = _align_and_cap(
            submissions,
            professor_grades,
            max_students=args.max_students_per_question,
        )

        if not submissions:
            print(f"  SKIP — no student submissions found for {qid}.", flush=True)
            continue
        if not professor_grades:
            print(f"  SKIP — no professor grades found for {qid}.", flush=True)
            continue

        print(
            f"  {len(submissions)} submissions | {len(professor_grades)} professor grades",
            flush=True,
        )

        t0 = time.time()
        try:
            result = calibrate_question(
                question_id=qid,
                question_meta=question_index[qid],
                rubric_meta=rubric_index[qid],
                solution=solution_index.get(qid, ""),
                submissions=submissions,
                professor_grades=professor_grades,
                api_url=args.api_url,
                max_rounds=args.max_rounds,
                normalized_difference_threshold=args.normalized_threshold,
            )
        except requests.HTTPError as e:
            print(f"  ERROR — HTTP {e.response.status_code}: {e.response.text[:200]}", flush=True)
            continue
        except Exception as e:
            print(f"  ERROR — {e}", flush=True)
            continue

        elapsed = time.time() - t0

        out_path = args.output_dir / f"calibration_{qid}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        best_mse = result.get("best_mse", "?")
        completed = result.get("completed_rounds", "?")
        stopping = result.get("stopping_reason", "")

        rounds_mse = [
            round(r["evaluation"]["metrics"]["mse"], 2)
            for r in result.get("rounds", [])
            if isinstance(r.get("evaluation"), dict)
        ]

        print(f"  Done in {elapsed:.0f}s | rounds: {completed} | MSE per round: {rounds_mse} | best MSE: {best_mse}", flush=True)
        print(f"  Stopping reason: {stopping}", flush=True)
        print(f"  Saved → {out_path}", flush=True)

        summary.append(
            {
                "question_id": qid,
                "benchmark_type": question_index[qid].get("benchmark_type"),
                "n_submissions": len(submissions),
                "completed_rounds": completed,
                "mse_per_round": rounds_mse,
                "best_mse": best_mse,
                "stopping_reason": stopping,
                "output_file": str(out_path),
            }
        )

    print("\n" + "=" * 60, flush=True)
    print("SUMMARY", flush=True)
    print("=" * 60, flush=True)
    for row in summary:
        print(
            f"  {row['question_id']:25s} | {row['benchmark_type']:30s} | "
            f"n={row['n_submissions']:2d} | MSE {row['mse_per_round']} → best={row['best_mse']}",
            flush=True,
        )

    summary_path = args.output_dir / "calibration_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"\nSummary saved → {summary_path}", flush=True)


if __name__ == "__main__":
    main()
