from __future__ import annotations

from pathlib import Path
from typing import Any
import sys
from pydantic import BaseModel

from src.grading_tool.utils.io import load_json, save_json
from src.grading_tool.grading.rubric_grader import RubricGrader


class BenchmarkManifest(BaseModel):
    course_id: str
    exam_id: str
    question_path: str
    rubric_path: str
    solutions_path: str
    student_answers_paths: list[str]
    professor_grade_path: str | None = None
    prompt_name: str | None = None


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


def _choose_single_json_file(
    benchmark_dir: Path,
    *,
    contains_any: tuple[str, ...],
    excludes: tuple[str, ...] = (),
    label: str,
) -> Path:
    candidates: list[Path] = []
    for p in benchmark_dir.glob("*.json"):
        stem = p.stem.lower()
        if any(token in stem for token in contains_any) and not any(
            token in stem for token in excludes
        ):
            candidates.append(p)

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
        f"Please specify the exact file path via CLI option."
    )


def _resolve_benchmark_inputs(
    benchmark_dir: Path,
    question_path: str | None,
    rubric_path: str | None,
    solutions_path: str | None,
    student_answers_paths: list[str] | None,
    manifest_path: str | None,
) -> tuple[Path, Path, Path, list[Path], Path | None, Path | None]:
    def _resolve_relative(base_dir: Path, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else base_dir / path

    inferred_manifest_path = benchmark_dir / "benchmark_manifest.json"
    manifest_file_path: Path | None = None

    if manifest_path:
        manifest_file_path = Path(manifest_path)
    elif inferred_manifest_path.exists():
        manifest_file_path = inferred_manifest_path

    if manifest_file_path is not None:
        if not manifest_file_path.exists():
            raise FileNotFoundError(f"Benchmark manifest not found: {manifest_file_path}")

        manifest_data = load_json(manifest_file_path)
        manifest = BenchmarkManifest.model_validate(manifest_data)

        question_file = _resolve_relative(benchmark_dir, manifest.question_path)
        rubric_file = _resolve_relative(benchmark_dir, manifest.rubric_path)
        solution_file = _resolve_relative(benchmark_dir, manifest.solutions_path)
        student_answer_files = [
            _resolve_relative(benchmark_dir, p) for p in manifest.student_answers_paths
        ]
        professor_grade_file = (
            _resolve_relative(benchmark_dir, manifest.professor_grade_path)
            if manifest.professor_grade_path
            else None
        )

        required_paths = [question_file, rubric_file, solution_file, *student_answer_files]
        if professor_grade_file is not None:
            required_paths.append(professor_grade_file)

        missing = [str(p) for p in required_paths if not p.exists()]
        if missing:
            raise FileNotFoundError(
                f"Missing required files referenced in manifest {manifest_file_path}: {missing}"
            )

        return (
            question_file,
            rubric_file,
            solution_file,
            sorted(student_answer_files),
            professor_grade_file,
            manifest_file_path,
        )

    question_file = (
        Path(question_path)
        if question_path
        else _choose_single_json_file(
            benchmark_dir,
            contains_any=("question",),
            excludes=("answers", "answer", "rubric", "solution", "professor", "grade"),
            label="question",
        )
    )
    rubric_file = (
        Path(rubric_path)
        if rubric_path
        else _choose_single_json_file(
            benchmark_dir,
            contains_any=("rubric",),
            excludes=(),
            label="rubric",
        )
    )
    solution_file = (
        Path(solutions_path)
        if solutions_path
        else _choose_single_json_file(
            benchmark_dir,
            contains_any=("solution",),
            excludes=("answer", "answers"),
            label="solution",
        )
    )

    if student_answers_paths:
        student_answer_files = [Path(p) for p in student_answers_paths]
    else:
        student_answer_files = []
        for p in benchmark_dir.glob("*.json"):
            stem = p.stem.lower()
            if ("answer" in stem or "answers" in stem) and "solution" not in stem:
                student_answer_files.append(p)

        if not student_answer_files:
            raise FileNotFoundError(
                f"Could not find student answer JSON files in {benchmark_dir}. "
                "Looked for names containing answer/answers."
            )

    required_paths = [question_file, rubric_file, solution_file, *student_answer_files]
    missing = [str(p) for p in required_paths if not p.exists()]
    if missing:
        raise FileNotFoundError(f"Missing required input files: {missing}")

    return question_file, rubric_file, solution_file, sorted(student_answer_files), None, None


def _load_student_answers(files: list[Path]) -> list[dict[str, Any]]:
    submissions: list[dict[str, Any]] = []
    for file_path in files:
        data = load_json(file_path)
        if not isinstance(data, list):
            raise ValueError(
                f"Expected student answer file to contain a JSON list: {file_path}"
            )
        submissions.extend(data)
    return submissions


def _count_gradeable_answers(
    students: list[dict[str, Any]],
    question_index: dict[str, dict[str, Any]],
    rubric_index: dict[str, dict[str, Any]],
    limit_questions: int | None = None,
    question_ids: set[str] | None = None,
) -> int:
    total = 0
    for student in students:
        answers = [
            ans
            for ans in student.get("answers", [])
            if ans["question_id"] in question_index and ans["question_id"] in rubric_index
        ]

        if question_ids is not None:
            answers = [ans for ans in answers if ans["question_id"] in question_ids]
        elif limit_questions is not None:
            answers = answers[:limit_questions]

        total += len(answers)

    return total


def _render_progress_bar(current: int, total: int, width: int = 28) -> str:
    if total <= 0:
        return "[no items to grade]"

    ratio = min(max(current / total, 0.0), 1.0)
    filled = int(round(width * ratio))
    bar = "█" * filled + "░" * (width - filled)
    percent = ratio * 100
    return f"[{bar}] {current}/{total} ({percent:5.1f}%)"


def _print_progress(current: int, total: int) -> None:
    message = _render_progress_bar(current, total)
    print(f"\r{message}", end="", file=sys.stderr, flush=True)


def _finish_progress(total: int, label: str = "done") -> None:
    if total > 0:
        print(f"\r{_render_progress_bar(total, total)} {label}", file=sys.stderr, flush=True)
    else:
        print(label, file=sys.stderr, flush=True)


def run_grading(
    benchmark_dir: str,
    output_path: str,
    run_name: str = "baseline_run",
    prompt_name: str = "prompt_v1",
    model_name: str | None = None,
    limit_students: int | None = None,
    limit_questions: int | None = None,
    question_ids: list[str] | None = None,
    question_path: str | None = None,
    rubric_path: str | None = None,
    solutions_path: str | None = None,
    student_answers_paths: list[str] | None = None,
    manifest_path: str | None = None,
    show_progress: bool = True,
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
        question_path: optional explicit path to question JSON file
        rubric_path: optional explicit path to rubric JSON file
        solutions_path: optional explicit path to solution JSON file
        student_answers_paths: optional explicit list of student answer JSON file paths
        manifest_path: optional path to benchmark manifest JSON (or benchmark_manifest.json auto-discovered)
        show_progress: whether to print a lightweight progress bar to stderr

    Returns:
        dict payload with run metadata and results
    """
    benchmark_dir_path = Path(benchmark_dir)
    (
        question_file_path,
        rubric_file_path,
        solution_file_path,
        student_answer_file_paths,
        professor_grade_file_path,
        benchmark_manifest_file_path,
    ) = _resolve_benchmark_inputs(
        benchmark_dir=benchmark_dir_path,
        question_path=question_path,
        rubric_path=rubric_path,
        solutions_path=solutions_path,
        student_answers_paths=student_answers_paths,
        manifest_path=manifest_path,
    )

    question_file = load_json(question_file_path)
    rubric_file = load_json(rubric_file_path)
    student_answers_file = _load_student_answers(student_answer_file_paths)
    solution_file = load_json(solution_file_path)

    question_index = _index_questions(question_file)
    rubric_index = _index_rubric(rubric_file)
    solution_index = _index_solutions(solution_file)

    grader = RubricGrader(model_name=model_name, prompt_name=prompt_name)
    resolved_model_name = grader.client.model_name

    results: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    students = student_answers_file
    if limit_students is not None:
        students = students[:limit_students]

    wanted_question_ids = set(question_ids) if question_ids else None
    total_gradeable_answers = _count_gradeable_answers(
        students=students,
        question_index=question_index,
        rubric_index=rubric_index,
        limit_questions=limit_questions,
        question_ids=wanted_question_ids,
    )

    graded_count = 0
    if show_progress:
        _print_progress(0, total_gradeable_answers)

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

            graded_count += 1
            if show_progress:
                _print_progress(graded_count, total_gradeable_answers)

    if show_progress:
        _finish_progress(total_gradeable_answers)

    payload: dict[str, Any] = {
        "run_name": run_name,
        "prompt_name": prompt_name,
        "model_name": resolved_model_name,
        "requested_model_name": model_name,
        "benchmark_dir": str(benchmark_dir_path),
        "question_path": str(question_file_path),
        "rubric_path": str(rubric_file_path),
        "solutions_path": str(solution_file_path),
        "student_answers_paths": [str(p) for p in student_answer_file_paths],
        "professor_grade_path": str(professor_grade_file_path)
        if professor_grade_file_path
        else None,
        "benchmark_manifest_path": str(benchmark_manifest_file_path)
        if benchmark_manifest_file_path
        else None,
        "n_results": len(results),
        "n_skipped": len(skipped),
        "results": results,
        "skipped": skipped,
    }

    save_json(output_path, payload)
    return payload
