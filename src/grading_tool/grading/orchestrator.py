from __future__ import annotations

from pathlib import Path
from typing import Any

from tqdm import tqdm

from src.grading_tool.utils.io import load_json, save_json
from src.grading_tool.grading.rubric_grader import RubricGrader


def _index_questions(question_file: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Build a flat index from question_id/subpart_id -> metadata.

    For q2, flatten subparts like q2b, q2c, ...
    For other questions, keep their original question_id.
    """
    out: dict[str, dict[str, Any]] = {}

    for q in question_file["questions"]:
        qid = q["question_id"]

        if qid == "q2":
            benchmark_type = q["benchmark_type"]
            for sp in q.get("subparts", []):
                part_id = sp["part_id"]
                out[part_id] = {
                    "question_id": part_id,
                    "parent_question_id": qid,
                    "question_text": sp["question_text"],
                    "benchmark_type": benchmark_type,
                    "score_max": 8.0,  # q2 subparts are each 8 points in curr benchmark
                }
        else:
            out[qid] = {
                "question_id": qid,
                "parent_question_id": qid,
                "question_text": q["question_text"],
                "benchmark_type": q["benchmark_type"],
                "score_max": float(q["points"]),
            }

    return out


def _index_rubric(rubric_file: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Build a flat rubric index from question_id/subpart_id -> rubric info.
    """
    out: dict[str, dict[str, Any]] = {}

    for q in rubric_file["questions"]:
        qid = q["question_id"]

        if qid == "q2":
            for sp in q.get("subparts", []):
                part_id = sp["part_id"]
                out[part_id] = {
                    "question_id": part_id,
                    "parent_question_id": qid,
                    "criteria": sp["criteria"],
                    "score_max": float(sp["total_points"]),
                    "correct_answer": sp.get("correct_answer"),
                    "grading_note": q.get("grading_note"),
                }
        else:
            out[qid] = {
                "question_id": qid,
                "parent_question_id": qid,
                "criteria": q.get("criteria", []),
                "score_max": float(q["total_points"]),
                "grading_note": q.get("grading_note"),
            }

    return out


def _index_solutions(solution_file: dict[str, Any]) -> dict[str, str]:
    """
    Build a flat solution index from question_id/subpart_id -> solution text.
    """
    out: dict[str, str] = {}

    for q in solution_file["questions"]:
        qid = q["question_id"]

        if qid == "q2":
            for sp in q.get("subparts", []):
                out[sp["part_id"]] = sp.get("solution", "")
        else:
            out[qid] = q.get("solution", "")

    return out


def _locate_benchmark_files(benchmark_dir: Path) -> dict[str, Path]:
    """
    Auto-detect and locate benchmark files.
    Supports both 'final' and 'midterm2' naming patterns.
    Returns dict mapping file type to Path.
    """
    files_found: dict[str, Path] = {}
    
    # Try to find each required file with flexible naming
    for file_type, possible_names in [
        ("questions", ["question_final.json", "question_midterm2.json"]),
        ("rubric", ["final_rubric.json", "midterm2_rubric.json"]),
        ("answers", ["final_student_answers.json", "midterm2_student_answers.json"]),
        ("solutions", ["solutions_final.json", "solutions_midterm2.json"]),
    ]:
        found = None
        for name in possible_names:
            path = benchmark_dir / name
            if path.exists():
                found = path
                break
        if found is None:
            raise FileNotFoundError(
                f"Could not find {file_type} file in {benchmark_dir}. "
                f"Tried: {possible_names}"
            )
        files_found[file_type] = found
    
    return files_found


def _validate_benchmark_files(benchmark_dir: Path) -> None:
    """Validate that all required benchmark files exist (now flexible naming)."""
    _locate_benchmark_files(benchmark_dir)


def run_grading(
    benchmark_dir: str,
    output_path: str,
    run_name: str = "baseline_run",
    prompt_name: str = "prompt_v1",
    model_name: str | None = None,
    limit_students: int | None = None,
    limit_questions: int | None = None,
    question_ids: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run grading over the benchmark and save results.

    Args:
        benchmark_dir: folder containing benchmark json files
        output_path: output json path for the grading run
        run_name: experiment/run name
        prompt_name: prompt version to use
        model_name: optional Gemini model override
        limit_students: optional debugging limit
        limit_questions: optional debugging limit per student
        question_ids: optional explicit question IDs to grade, e.g. ["q7", "q8"]

    Returns:
        dict payload with run metadata and results
    """
    benchmark_dir_path = Path(benchmark_dir)
    _validate_benchmark_files(benchmark_dir_path)
    
    # Locate files with flexible naming support
    files = _locate_benchmark_files(benchmark_dir_path)

    question_file = load_json(files["questions"])
    rubric_file = load_json(files["rubric"])
    student_answers_file = load_json(files["answers"])
    solution_file = load_json(files["solutions"])

    question_index = _index_questions(question_file)
    rubric_index = _index_rubric(rubric_file)
    solution_index = _index_solutions(solution_file)

    grader = RubricGrader(model_name=model_name, prompt_name=prompt_name)

    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    students = student_answers_file
    if limit_students is not None:
        students = students[:limit_students]

    wanted_question_ids = set(question_ids) if question_ids else None

    print(f"Starting grading run: {run_name}")
    print(f"Prompt: {prompt_name}")
    print(f"Total students: {len(students)}")
    print()

    for student in tqdm(students, desc="Grading students", unit="student"):
        student_id = student["student_id"]
        answers = [
            ans
            for ans in student.get("answers", [])
            if ans["question_id"] in question_index and ans["question_id"] in rubric_index
        ]

        if wanted_question_ids is not None:
            answers = [ans for ans in answers if ans["question_id"] in wanted_question_ids]
        elif limit_questions is not None:
            answers = answers[:limit_questions]

        for ans in tqdm(answers, desc=f"  Student {student_id}", unit="q", leave=False):
            qid = ans["question_id"]
            student_answer = ans.get("student_answer", "")

            if qid not in question_index:
                skipped.append(
                    {
                        "student_id": student_id,
                        "question_id": qid,
                        "reason": "question_not_found_in_question_index",
                    }
                )
                continue

            if qid not in rubric_index:
                skipped.append(
                    {
                        "student_id": student_id,
                        "question_id": qid,
                        "reason": "question_not_found_in_rubric_index",
                    }
                )
                continue

            q_meta = question_index[qid]
            r_meta = rubric_index[qid]
            reference_solution = solution_index.get(qid, "")

            rubric_payload = {
                "criteria": r_meta["criteria"],
                "grading_note": r_meta.get("grading_note"),
            }

            grade_result = grader.grade_question(
                student_id=student_id,
                question_id=qid,
                benchmark_type=q_meta["benchmark_type"],
                question_text=q_meta["question_text"],
                rubric=rubric_payload,
                student_answer=student_answer,
                score_max=float(r_meta["score_max"]),
                reference_solution=reference_solution,
            )

            result_dict = grade_result.model_dump()
            result_dict["parent_question_id"] = q_meta["parent_question_id"]
            results.append(result_dict)

    # Calculate total points summary
    total_points_awarded = sum(r.get("score_awarded", 0) for r in results)
    total_points_max = sum(r.get("score_max", 0) for r in results)
    overall_percentage = (total_points_awarded / total_points_max * 100) if total_points_max > 0 else 0.0
    
    # Calculate per-student totals
    per_student_totals: dict[str, dict[str, float]] = {}
    for result in results:
        sid = result["student_id"]
        if sid not in per_student_totals:
            per_student_totals[sid] = {"awarded": 0.0, "max": 0.0}
        per_student_totals[sid]["awarded"] += result.get("score_awarded", 0)
        per_student_totals[sid]["max"] += result.get("score_max", 0)
    
    for sid in per_student_totals:
        per_student_totals[sid]["percentage"] = (
            per_student_totals[sid]["awarded"] / per_student_totals[sid]["max"] * 100
            if per_student_totals[sid]["max"] > 0
            else 0.0
        )

    payload: dict[str, Any] = {
        "run_name": run_name,
        "prompt_name": prompt_name,
        "model_name": model_name,
        "benchmark_dir": str(benchmark_dir_path),
        "n_results": len(results),
        "n_skipped": len(skipped),
        "total_points": {
            "awarded": total_points_awarded,
            "max": total_points_max,
            "percentage": overall_percentage,
        },
        "per_student_totals": per_student_totals,
        "results": results,
        "skipped": skipped,
    }

    save_json(output_path, payload)
    print()
    print(f"✓ Grading complete!")
    print(f"  Results: {len(results)} graded")
    print(f"  Skipped: {len(skipped)}")
    print(f"  Total Points: {total_points_awarded:.1f} / {total_points_max:.1f} ({overall_percentage:.1f}%)")
    print(f"  Saved to: {output_path}")
    return payload
