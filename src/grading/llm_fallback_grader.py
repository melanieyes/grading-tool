from __future__ import annotations

from dataclasses import dataclass, asdict

from src.models.gemini_client import GeminiClient


FALLBACK_SYSTEM_PROMPT = """
You are a strict but fair grader for a formal languages homework question about regular expressions over the alphabet {a, b}.

You will receive:
- the subpart key
- the language description
- the professor reference regex if available
- the student's answer
- the deterministic grading result
- short evidence from deterministic checking

Your job:
- decide whether the student answer is mathematically correct
- allow equivalent but nonstandard notation
- assign a score of 1.0, 0.5, or 0.0
- provide a concise reasoning_summary
- provide concise feedback
- provide a confidence score between 0.0 and 1.0

Rules:
- Return JSON only.
- Do not include markdown fences.
- If the answer is clearly correct but uses set notation or prose, full credit is allowed.
- If the answer is ambiguous but mostly correct, use 0.5.
- If the answer is mathematically wrong, use 0.0.
- Be conservative with confidence when the notation is ambiguous.
"""


@dataclass
class LLMFallbackResult:
    status: str
    score: float
    confidence: float
    grading_method: str
    reasoning_summary: str
    feedback: str
    notes: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


class LLMFallbackGrader:
    def __init__(self, model_name: str | None = None):
        self.client = GeminiClient(model_name=model_name)

    def grade(
        self,
        subpart_key: str,
        description: str,
        student_answer: str,
        deterministic_result: dict,
        professor_reference_regex: str | None = None,
    ) -> LLMFallbackResult:
        payload = {
            "question_id": "h4q9",
            "subpart": subpart_key,
            "description": description,
            "alphabet": ["a", "b"],
            "professor_reference_regex": professor_reference_regex,
            "student_answer": student_answer,
            "deterministic_result": deterministic_result,
        }

        raw = self.client.generate_json(FALLBACK_SYSTEM_PROMPT, payload)

        status = str(raw.get("status", "needs_review"))
        score = float(raw.get("score", 0.0))
        confidence = float(raw.get("confidence", 0.5))
        reasoning_summary = str(raw.get("reasoning_summary", "Fallback grading used."))
        feedback = str(raw.get("feedback", "Fallback grading used."))
        notes = raw.get("notes", [])
        if not isinstance(notes, list):
            notes = [str(notes)]

        return LLMFallbackResult(
            status=status,
            score=score,
            confidence=confidence,
            grading_method="llm_fallback",
            reasoning_summary=reasoning_summary,
            feedback=feedback,
            notes=[str(x) for x in notes],
        )