from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class SubpartSpec:
    key: str
    description: str
    max_score: float = 1.0
    reference_regex: str | None = None


@dataclass
class QuestionSpec:
    hw_id: int
    question_id: str
    title: str
    alphabet: list[str]
    subparts: dict[str, SubpartSpec]
    grading_note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def load_json(path: str | Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _find_question_entry(items: list[dict], question_id: str) -> dict:
    for item in items:
        if str(item.get("question_id", "")).lower() == question_id.lower():
            return item
    raise ValueError(f"Could not find {question_id} in questions file.")


def _find_solution_entry(items: list[dict], question_id: str) -> dict:
    for item in items:
        if str(item.get("question_id", "")).lower() == question_id.lower():
            return item
    raise ValueError(f"Could not find {question_id} in solutions file.")


def _extract_subpart_descriptions(q9_question_obj: dict) -> dict[str, str]:
    """
    Flexible parser for questions_hw4.json.
    We try several common shapes so your loader won't break easily.
    """
    descriptions: dict[str, str] = {}

    # Case 1: already has {"subparts": {"a": "...", ...}}
    subparts = q9_question_obj.get("subparts")
    if isinstance(subparts, dict):
        for key, value in subparts.items():
            if isinstance(value, dict):
                descriptions[key] = str(value.get("description", "")).strip()
            else:
                descriptions[key] = str(value).strip()
        return descriptions

    # Case 2: maybe stored under "question_text" or "prompt"
    text_candidates = [
        q9_question_obj.get("question_text"),
        q9_question_obj.get("prompt"),
        q9_question_obj.get("description"),
        q9_question_obj.get("text"),
    ]

    combined_text = "\n".join(str(t) for t in text_candidates if t)
    if combined_text:
        # very lightweight fallback; if structured subparts aren't present,
        # we still return standard known Q9 descriptions.
        return {
            "a": "begins with a and ends with b",
            "b": "has exactly two a's",
            "c": "contains at least two b's",
            "d": "has exactly two a's and at least two b's",
            "e": "every odd position is b",
            "f": "any string except aa and aba",
            "g": "contains neither ab nor ba",
            "h": "even length and odd number of a's",
        }

    # Final fallback for this specific homework question
    return {
        "a": "begins with a and ends with b",
        "b": "has exactly two a's",
        "c": "contains at least two b's",
        "d": "has exactly two a's and at least two b's",
        "e": "every odd position is b",
        "f": "any string except aa and aba",
        "g": "contains neither ab nor ba",
        "h": "even length and odd number of a's",
    }


def load_question_with_ground_truth(
    questions_path: str | Path,
    solutions_path: str | Path,
    target_question_id: str = "h4q9",
) -> QuestionSpec:
    questions_data = load_json(questions_path)
    solutions_data = load_json(solutions_path)

    if not isinstance(questions_data, list):
        raise ValueError("Expected questions_hw4.json to be a list.")
    if not isinstance(solutions_data, list):
        raise ValueError("Expected solutions_hw4.json to be a list.")

    q_obj = _find_question_entry(questions_data, target_question_id)
    s_obj = _find_solution_entry(solutions_data, target_question_id)

    descriptions = _extract_subpart_descriptions(q_obj)
    reference_solution = s_obj.get("reference_solution", {})

    subparts: dict[str, SubpartSpec] = {}
    for key in ["a", "b", "c", "d", "e", "f", "g", "h"]:
        subparts[key] = SubpartSpec(
            key=key,
            description=descriptions.get(key, ""),
            max_score=1.0,
            reference_regex=reference_solution.get(key),
        )

    return QuestionSpec(
        hw_id=int(s_obj.get("hw_id", 4)),
        question_id=str(s_obj.get("question_id", target_question_id)),
        title=str(q_obj.get("title", "HW4 Question 9")),
        alphabet=["a", "b"],
        subparts=subparts,
        grading_note=s_obj.get("grading_note"),
    )