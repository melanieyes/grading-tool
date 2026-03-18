from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class StudentSubmission:
    student_id: str
    question_id: str
    answers: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_json(path: str | Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_q9_student_answers(
    answers_path: str | Path,
    target_question_id: str = "h4q9",
) -> list[StudentSubmission]:
    data = load_json(answers_path)

    if not isinstance(data, list):
        raise ValueError("Expected hw4_q9_student_answers.json to be a list.")

    submissions: list[StudentSubmission] = []
    for item in data:
        question_id = str(item.get("question_id", "")).lower()
        if question_id != target_question_id.lower():
            continue

        answers = item.get("answers", {})
        filtered_answers = {k: str(v) for k, v in answers.items() if k in list("abcdefgh")}

        submissions.append(
            StudentSubmission(
                student_id=str(item.get("student_id", "")),
                question_id=str(item.get("question_id", target_question_id)),
                answers=filtered_answers,
            )
        )

    return submissions