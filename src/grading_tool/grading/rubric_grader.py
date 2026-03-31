from __future__ import annotations

from src.grading_tool.models.gemini_client import GeminiClient
from src.grading_tool.grading.prompt_builder import build_payload
from src.grading_tool.grading.response_parser import parse_grade_response


class RubricGrader:
    def __init__(self, model_name: str | None = None, prompt_name: str = "prompt_v1"):
        self.client = GeminiClient(model_name=model_name)
        self.prompt_name = prompt_name

    def grade_question(
        self,
        student_id: str,
        question_id: str,
        benchmark_type: str,
        question_text: str,
        rubric: dict,
        student_answer: str,
        score_max: float,
        reference_solution: str | None = None,
    ):
        system_prompt, payload = build_payload(
            prompt_name=self.prompt_name,
            benchmark_type=benchmark_type,
            question_text=question_text,
            rubric=rubric,
            student_answer=student_answer,
            reference_solution=reference_solution,
        )

        raw = self.client.generate_json(system_prompt, payload)

        return parse_grade_response(
            raw=raw,
            student_id=student_id,
            question_id=question_id,
            benchmark_type=benchmark_type,
            score_max=score_max,
        )