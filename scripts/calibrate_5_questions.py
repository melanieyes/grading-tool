from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from src.grading_tool.utils.io import load_json, save_json


def _choose_single_json_file(
    benchmark_dir: Path,
    *,
    contains_any: tuple[str, ...],
    excludes: tuple[str, ...] = (),
    label: str,
) -> Path:
    candidates: list[Path] = []
    for path in benchmark_dir.glob("*.json"):
        stem = path.stem.lower()
        if any(token in stem for token in contains_any) and not any(
            token in stem for token in excludes
        ):
            candidates.append(path)

    if len(candidates) == 1:
        return candidates[0]

    if not candidates:
        raise FileNotFoundError(
            f"Could not find a {label} JSON file in {benchmark_dir}. "
            f"Looked for names containing: {contains_any}."
        )

    names = [p.name for p in sorted(candidates)]
    raise ValueError(
        f"Found multiple candidate {label} JSON files in {benchmark_dir}: {names}. "
        "Please specify the exact file path via CLI option."
    )


def _infer_benchmark_files(benchmark_dir: Path) -> tuple[Path, Path, Path, Path, Path]:
    question_path = _choose_single_json_file(
        benchmark_dir,
        contains_any=("question",),
        excludes=("answers", "answer", "rubric", "solution", "professor", "grade"),
        label="question",
    )
    rubric_path = _choose_single_json_file(
        benchmark_dir,
        contains_any=("rubric",),
        excludes=(),
        label="rubric",
    )
    solution_path = _choose_single_json_file(
        benchmark_dir,
        contains_any=("solution",),
        excludes=("answer", "answers"),
        label="solution",
    )

    # Student answers file naming varies across benchmarks.
    student_answers_path = _choose_single_json_file(
        benchmark_dir,
        contains_any=("answer", "answers"),
        excludes=("solution", "professor", "grade", "rubric", "question"),
        label="student answers",
    )

    professor_grade_path = _choose_single_json_file(
        benchmark_dir,
        contains_any=("professor", "grade"),
        excludes=("rubric", "question", "solution", "answer", "answers"),
        label="professor grades",
    )

    return question_path, rubric_path, solution_path, student_answers_path, professor_grade_path


def _index_question_specs(question_file: dict[str, Any]) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}

    for q in question_file.get("questions", []):
        qid = str(q.get("question_id"))
        benchmark_type = str(q.get("benchmark_type") or "unknown")
        parent_text = str(q.get("question_text") or "").strip()

        subparts = q.get("subparts") or []
        if subparts:
            for sp in subparts:
                part_id = str(sp.get("part_id"))
                part_text = str(sp.get("question_text") or "").strip()
                full_text = (parent_text + "\n" + part_text).strip() if part_text else parent_text
                out[part_id] = {
                    "question_id": part_id,
                    "benchmark_type": benchmark_type,
                    "question_text": full_text,
                }
        else:
            out[qid] = {
                "question_id": qid,
                "benchmark_type": benchmark_type,
                "question_text": parent_text,
            }

    return out


def _index_rubrics(rubric_file: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}

    for q in rubric_file.get("questions", []):
        qid = str(q.get("question_id"))
        grading_note = q.get("grading_note")

        subparts = q.get("subparts") or []
        if subparts:
            for sp in subparts:
                part_id = str(sp.get("part_id"))
                out[part_id] = {
                    "criteria": sp.get("criteria") or [],
                    "grading_note": grading_note,
                }
        else:
            out[qid] = {
                "criteria": q.get("criteria") or [],
                "grading_note": grading_note,
            }

    return out


def _index_solutions(solution_file: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}

    for q in solution_file.get("questions", []):
        qid = str(q.get("question_id"))

        subparts = q.get("subparts") or []
        if subparts:
            for sp in subparts:
                part_id = str(sp.get("part_id"))
                out[part_id] = str(sp.get("solution") or "")
        else:
            out[qid] = str(q.get("solution") or "")

    return out


def _index_student_answers(student_answers_file: list[dict[str, Any]]) -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}

    for row in student_answers_file:
        student_id = str(row.get("student_id"))
        for ans in row.get("answers", []) or []:
            qid = str(ans.get("question_id"))
            out[(student_id, qid)] = str(ans.get("student_answer") or "")

    return out


def _index_professor_grades(professor_grade_file: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, float]]:
    out: dict[tuple[str, str], dict[str, float]] = {}

    for row in professor_grade_file:
        student_id = str(row.get("student_id"))
        for g in row.get("grades", []) or []:
            qid = str(g.get("question_id"))
            score = float(g.get("score", 0.0))
            # benchmark files use score_max; API expects max_score
            max_score = float(g.get("score_max", g.get("max_score", 0.0)) or 0.0)
            out[(student_id, qid)] = {"score": score, "max_score": max_score}

    return out


def _flatten_question_ids(question_file: dict[str, Any]) -> list[str]:
    ids: list[str] = []

    for q in question_file.get("questions", []) or []:
        qid = str(q.get("question_id"))
        subparts = q.get("subparts") or []
        if subparts:
            for sp in subparts:
                ids.append(str(sp.get("part_id")))
        else:
            ids.append(qid)

    return ids


def _http_post_json(url: str, payload: dict[str, Any], timeout_s: int = 300) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = Request(
        url=url,
        method="POST",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urlopen(req, timeout=timeout_s) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text)
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        raise RuntimeError(f"HTTP {e.code} from {url}: {body}") from e
    except URLError as e:
        raise RuntimeError(f"Failed to reach {url}: {e}") from e


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run rubric calibration on the first N question IDs in a benchmark dir by calling the FastAPI /api/evaluation/calibrate endpoint.",
    )
    parser.add_argument(
        "--benchmark_dir",
        type=str,
        required=True,
        help="Benchmark directory containing question/rubric/solution/answers/professor_grade JSON files.",
    )
    parser.add_argument(
        "--api_base_url",
        type=str,
        default="http://127.0.0.1:8000",
        help="FastAPI base URL (default: http://127.0.0.1:8000).",
    )
    parser.add_argument(
        "--max_questions",
        type=int,
        default=5,
        help="How many question IDs to calibrate (default: 5).",
    )
    parser.add_argument(
        "--question_ids",
        nargs="*",
        default=None,
        help=(
            "Optional explicit question IDs to calibrate (overrides --max_questions). "
            "Example: --question_ids midterm1_q6 midterm2_q3 final_q7"
        ),
    )
    parser.add_argument(
        "--max_students_per_question",
        type=int,
        default=10,
        help="Cap submissions per question to control LLM cost (default: 10).",
    )
    parser.add_argument(
        "--max_rounds",
        type=int,
        default=5,
        help="Calibration rounds per question (default: 5).",
    )
    parser.add_argument(
        "--difference_threshold",
        type=float,
        default=0.5,
        help="Raw score difference threshold for flagged cases (default: 0.5).",
    )
    parser.add_argument(
        "--normalized_difference_threshold",
        type=float,
        default=0.10,
        help="Normalized difference threshold (default: 0.10).",
    )
    parser.add_argument(
        "--include_semantic_metrics",
        action="store_true",
        help="Enable semantic metrics (slower; default off).",
    )
    parser.add_argument(
        "--out_dir",
        type=str,
        default="data/outputs/calibration",
        help="Directory to write calibration result JSON files.",
    )
    parser.add_argument(
        "--dry_run",
        action="store_true",
        help="Print selected question IDs and exit without calling API.",
    )

    args = parser.parse_args()

    benchmark_dir = Path(args.benchmark_dir)
    if not benchmark_dir.exists():
        raise FileNotFoundError(f"benchmark_dir not found: {benchmark_dir}")

    question_path, rubric_path, solution_path, student_answers_path, professor_grade_path = _infer_benchmark_files(
        benchmark_dir
    )

    question_file = load_json(question_path)
    rubric_file = load_json(rubric_path)
    solution_file = load_json(solution_path)
    student_answers_file = load_json(student_answers_path)
    professor_grade_file = load_json(professor_grade_path)

    question_index = _index_question_specs(question_file)
    rubric_index = _index_rubrics(rubric_file)
    solution_index = _index_solutions(solution_file)

    answers_index = _index_student_answers(student_answers_file)
    prof_index = _index_professor_grades(professor_grade_file)

    all_qids = _flatten_question_ids(question_file)
    if args.question_ids:
        chosen_qids = [str(qid) for qid in args.question_ids]
    else:
        chosen_qids = all_qids[: max(args.max_questions, 0)]

    if args.dry_run:
        print("Selected question IDs:")
        for qid in chosen_qids:
            print("-", qid)
        return 0

    endpoint = args.api_base_url.rstrip("/") + "/api/evaluation/calibrate"
    out_dir = Path(args.out_dir)

    for qid in chosen_qids:
        if qid not in question_index:
            print(f"[warn] skipping {qid}: not found in question_index", file=sys.stderr)
            continue
        if qid not in rubric_index:
            print(f"[warn] skipping {qid}: not found in rubric_index", file=sys.stderr)
            continue

        question_text = question_index[qid]["question_text"]
        benchmark_type = question_index[qid]["benchmark_type"]
        rubric_payload = {
            "criteria": rubric_index[qid]["criteria"],
            "grading_note": rubric_index[qid].get("grading_note") or "",
        }
        solution = solution_index.get(qid, "")

        # Collect students who have both an answer and a professor grade for this qid.
        students = sorted({sid for (sid, q) in answers_index.keys() if q == qid})

        submissions = []
        professor_grades = []

        for student_id in students:
            if len(submissions) >= args.max_students_per_question:
                break

            answer = answers_index.get((student_id, qid))
            prof = prof_index.get((student_id, qid))
            if answer is None or prof is None:
                continue

            submissions.append({"student_id": student_id, "question_id": qid, "answer": answer})
            professor_grades.append(
                {
                    "student_id": student_id,
                    "question_id": qid,
                    "score": float(prof["score"]),
                    "max_score": float(prof["max_score"] or 0.0) or 1.0,
                }
            )

        if not submissions:
            print(f"[warn] skipping {qid}: no matching submissions/professor grades", file=sys.stderr)
            continue

        payload = {
            "question_id": qid,
            "question_text": question_text,
            "benchmark_type": benchmark_type,
            "original_rubric": rubric_payload,
            "solution": solution,
            "submissions": submissions,
            "professor_grades": professor_grades,
            "max_rounds": int(args.max_rounds),
            "difference_threshold": float(args.difference_threshold),
            "normalized_difference_threshold": float(args.normalized_difference_threshold),
            "include_semantic_metrics": bool(args.include_semantic_metrics),
        }

        print(f"[calibrate] {qid}: students={len(submissions)} rounds={args.max_rounds}")
        result = _http_post_json(endpoint, payload)

        out_path = out_dir / f"{benchmark_dir.name}__{qid}__calibration.json"
        save_json(out_path, result)
        best_idx = result.get("best_round_index")
        best_mse = result.get("best_mse")
        print(f"[calibrate] saved {out_path} (best_round={best_idx}, best_mse={best_mse})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
