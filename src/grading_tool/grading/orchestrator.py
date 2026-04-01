from __future__ import annotations

from pathlib import Path
from typing import Any

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


def _validate_benchmark_files(benchmark_dir: Path) -> None:
    required = [
        "question_final.json",
        "final_rubric.json",
        "final_student_answers.json",
        "solutions_final.json",
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

    Returns:
        dict payload with run metadata and results
    """
    benchmark_dir_path = Path(benchmark_dir)
    _validate_benchmark_files(benchmark_dir_path)

    question_file = load_json(benchmark_dir_path / "question_final.json")
    rubric_file = load_json(benchmark_dir_path / "final_rubric.json")
    student_answers_file = load_json(benchmark_dir_path / "final_student_answers.json")
    solution_file = load_json(benchmark_dir_path / "solutions_final.json")

    question_index = _index_questions(question_file)
    rubric_index = _index_rubric(rubric_file)
    solution_index = _index_solutions(solution_file)

    grader = RubricGrader(model_name=model_name, prompt_name=prompt_name)

    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    students = student_answers_file
    if limit_students is not None:
        students = students[:limit_students]

    for student in students:
        student_id = student["student_id"]
        answers = [
                ans for ans in student.get("answers", [])
                if ans["question_id"] in question_index and ans["question_id"] in rubric_index]


        if limit_questions is not None:
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
