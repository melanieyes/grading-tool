from __future__ import annotations

from pathlib import Path
from typing import Any

from src.grading_tool.utils.io import load_json, save_json
from src.grading_tool.grading.rubric_grader import RubricGrader

def _index_questions(question_file: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}

    # Specific point mappings for subquestions
    subpart_points = {
        "q4": {"i": 20.0, "ii": 10.0, "iii": 10.0},
        "q5": {"a": 10.0, "b": 10.0, "c": 4.0, "d": 10.0}
    }

    for q in question_file["questions"]:
        qid = q["question_id"]

        # If the question has subparts, flatten them
        if q.get("subparts"):
            benchmark_type = q["benchmark_type"]
            for sp in q["subparts"]:
                part_id = sp["part_id"]
                
                # Extract suffix to find points (e.g., 'i' from 'q4i')
                suffix = part_id.replace(qid, "")
                
                # Get points from mapping; default to 0.0 if not found
                score_max = subpart_points.get(qid, {}).get(suffix, 0.0)

                out[part_id] = {
                    "question_id": part_id,
                    "parent_question_id": qid,
                    "question_text": sp["question_text"],
                    "benchmark_type": benchmark_type,
                    "score_max": score_max,
                }
        else:
            # Standard question handling
            out[qid] = {
                "question_id": qid,
                "parent_question_id": qid,
                "question_text": q["question_text"],
                "benchmark_type": q["benchmark_type"],
                "score_max": float(q.get("points", 0.0)),
            }

    return out

def _index_rubric(rubric_file: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Build a flat rubric index from question_id/subpart_id -> rubric info.
    """
    out: dict[str, dict[str, Any]] = {}

    for q in rubric_file["questions"]:
        qid = q["question_id"]

        # If subparts exist, flatten them into the index
        if q.get("subparts"):
            for sp in q["subparts"]:
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
            # Standard top-level question
            out[qid] = {
                "question_id": qid,
                "parent_question_id": qid,
                "criteria": q.get("criteria", []),
                "score_max": float(q.get("total_points", 0.0)),
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

        # Check for subparts to extract the correct solution text for each
        if q.get("subparts"):
            for sp in q["subparts"]:
                out[sp["part_id"]] = sp.get("solution", "")
        else:
            # Single solution for the whole question
            out[qid] = q.get("solution", "")

    return out


def _validate_benchmark_files(benchmark_dir: Path) -> None:
    required = [
        "question_midterm1.json",
        "rubric_midterm1.json",
        "answers_midterm1.json",
        "solution_midterm1.json",
    ]

    missing = [name for name in required if not (benchmark_dir / name).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing required benchmark files in {benchmark_dir}: {missing}"
        )


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

    question_file = load_json(benchmark_dir_path / "question_midterm1.json")
    rubric_file = load_json(benchmark_dir_path / "rubric_midterm1.json")
    student_answers_file = load_json(benchmark_dir_path / "answers_midterm1.json")
    solution_file = load_json(benchmark_dir_path / "solution_midterm1.json")

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

    for student in students:
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

        for ans in answers:
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

    payload: dict[str, Any] = {
        "run_name": run_name,
        "prompt_name": prompt_name,
        "model_name": model_name,
        "benchmark_dir": str(benchmark_dir_path),
        "n_results": len(results),
        "n_skipped": len(skipped),
        "results": results,
        "skipped": skipped,
    }

    save_json(output_path, payload)
    return payload
