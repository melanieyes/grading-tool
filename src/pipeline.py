from __future__ import annotations

from src.grading.answer_loader import load_q9_student_answers
from src.grading.deterministic_checker import grade_regex_deterministically
from src.grading.language_specs import LANGUAGE_SPECS
from src.grading.llm_fallback_grader import LLMFallbackGrader
from src.grading.question_loader import load_question_with_ground_truth


def should_use_llm_fallback(result_dict: dict) -> bool:
    return result_dict["status"] in {"unsupported_notation", "invalid_regex"}


def grade_one_submission(question_spec, submission, max_len: int = 10, use_llm_fallback: bool = True) -> dict:
    subpart_results = {}
    total_score = 0.0
    max_score = 0.0

    llm_grader = None
    llm_available = False

    if use_llm_fallback:
        try:
            llm_grader = LLMFallbackGrader()
            llm_available = True
        except Exception as e:
            llm_available = False
            llm_init_error = str(e)

    for subpart_key, subpart_spec in question_spec.subparts.items():
        student_answer = submission.answers.get(subpart_key, "")

        deterministic_result = grade_regex_deterministically(
            student_answer=student_answer,
            max_len=max_len,
            reference_answer=subpart_spec.reference_regex,
            reference_predicate=LANGUAGE_SPECS.get(subpart_key),
        )
        result_dict = deterministic_result.to_dict()

        if use_llm_fallback and not llm_available and should_use_llm_fallback(result_dict):
            result_dict["notes"] = result_dict.get("notes", []) + [
                f"LLM fallback unavailable: {llm_init_error}"
            ]

        if llm_available and should_use_llm_fallback(result_dict):
            try:
                llm_result = llm_grader.grade(
                    subpart_key=subpart_key,
                    description=subpart_spec.description,
                    student_answer=student_answer,
                    deterministic_result=result_dict,
                    professor_reference_regex=subpart_spec.reference_regex,
                )

                merged = dict(result_dict)
                merged["score"] = llm_result.score
                merged["confidence"] = llm_result.confidence
                merged["grading_method"] = llm_result.grading_method
                merged["reasoning_summary"] = llm_result.reasoning_summary
                merged["feedback"] = llm_result.feedback
                merged["notes"] = result_dict.get("notes", []) + llm_result.notes
                merged["status"] = llm_result.status
                result_dict = merged
            except Exception as e:
                result_dict["notes"] = result_dict.get("notes", []) + [
                    f"LLM fallback call failed: {e}"
                ]

        subpart_results[subpart_key] = result_dict
        total_score += float(result_dict["score"])
        max_score += subpart_spec.max_score

    return {
        "student_id": submission.student_id,
        "question_id": submission.question_id,
        "total_score": total_score,
        "max_score": max_score,
        "subparts": subpart_results,
    }


def run_q9_grading_pipeline(
    questions_path: str = "data/raw/questions_hw4.json",
    solutions_path: str = "data/raw/solutions_hw4.json",
    answers_path: str = "data/raw/hw4_q9_student_answers.json",
    max_len: int = 10,
    use_llm_fallback: bool = True,
) -> list[dict]:
    question_spec = load_question_with_ground_truth(
        questions_path=questions_path,
        solutions_path=solutions_path,
        target_question_id="h4q9",
    )

    submissions = load_q9_student_answers(
        answers_path=answers_path,
        target_question_id="h4q9",
    )

    graded = [
        grade_one_submission(
            question_spec=question_spec,
            submission=submission,
            max_len=max_len,
            use_llm_fallback=use_llm_fallback,
        )
        for submission in submissions
    ]
    return graded