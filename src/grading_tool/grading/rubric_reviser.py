from __future__ import annotations

from copy import deepcopy
from typing import Any


def revise_rubric(
    original_rubric: Any,
    mistake_stats: dict | None = None,
    flagged_cases: list[dict] | None = None,
    instructor_note: str | None = None,
    round_index: int | None = None,
) -> dict:
    mistake_stats = mistake_stats or {}
    flagged_cases = flagged_cases or []

    common_mistakes = _extract_common_mistakes(mistake_stats)
    revision_needed = bool(common_mistakes or flagged_cases or instructor_note)

    if not revision_needed:
        return {
            "revision_needed": False,
            "revised_rubric": original_rubric,
            "change_log": [],
            "justification": "No recurring mistake pattern or grading disagreement was detected.",
        }

    revised_rubric = _wrap_rubric(original_rubric)
    revision_notes = revised_rubric.setdefault("revision_notes", [])

    change_log: list[dict] = []

    for mistake in common_mistakes[:5]:
        tag = mistake.get("tag", "unknown_mistake")
        count = mistake.get("count", 0)
        percentage = mistake.get("percentage", 0.0)
        description = mistake.get("description", "")

        suggestion = (
            "Clarify how to award partial credit when students show this pattern: "
            f"{description or tag}."
        )

        note = {
            "type": "common_mistake",
            "mistake_tag": tag,
            "suggestion": suggestion,
            "evidence": {
                "count": count,
                "percentage": percentage,
                "affected_students": mistake.get("affected_students", []),
            },
        }

        revision_notes.append(note)

        change_log.append(
            {
                "old": None,
                "new": suggestion,
                "justification": (
                    f"This pattern appears in {count} submissions "
                    f"({round(float(percentage) * 100, 2)}%)."
                ),
            }
        )

    if flagged_cases:
        disagreement_note = _build_disagreement_note(flagged_cases)
        revision_notes.append(disagreement_note)

        change_log.append(
            {
                "old": None,
                "new": disagreement_note["suggestion"],
                "justification": (
                    f"{len(flagged_cases)} AI/professor score differences exceeded the threshold."
                ),
            }
        )

    if instructor_note:
        revision_notes.append(
            {
                "type": "instructor_note",
                "suggestion": instructor_note,
            }
        )

        change_log.append(
            {
                "old": None,
                "new": instructor_note,
                "justification": "Instructor explicitly requested this rubric adjustment.",
            }
        )

    if round_index is not None:
        revised_rubric["calibration_round"] = round_index

    return {
        "revision_needed": True,
        "revised_rubric": revised_rubric,
        "change_log": change_log,
        "justification": _build_revision_justification(
            common_mistakes=common_mistakes,
            flagged_cases=flagged_cases,
            instructor_note=instructor_note,
        ),
    }


def _wrap_rubric(original_rubric: Any) -> dict:
    if isinstance(original_rubric, dict):
        wrapped = deepcopy(original_rubric)
        wrapped.setdefault("original_rubric_preserved", True)
        return wrapped

    return {
        "original_rubric": deepcopy(original_rubric),
        "original_rubric_preserved": True,
    }


def _extract_common_mistakes(mistake_stats: dict) -> list[dict]:
    if not mistake_stats:
        return []

    if "common_mistakes" in mistake_stats:
        return list(mistake_stats.get("common_mistakes") or [])

    if "mistakes" in mistake_stats:
        return list(mistake_stats.get("mistakes") or [])

    return []


def _build_disagreement_note(flagged_cases: list[dict]) -> dict:
    high_ai_cases = []
    low_ai_cases = []

    for case in flagged_cases:
        diff = float(case.get("difference", 0.0))

        if diff > 0:
            high_ai_cases.append(case)
        elif diff < 0:
            low_ai_cases.append(case)

    suggestion_parts = []

    if high_ai_cases:
        suggestion_parts.append(
            "Add stricter guidance for cases where the AI gives more credit than the professor."
        )

    if low_ai_cases:
        suggestion_parts.append(
            "Add clearer partial-credit guidance for cases where the AI gives less credit than the professor."
        )

    if not suggestion_parts:
        suggestion_parts.append(
            "Clarify score boundaries for cases with large AI/professor disagreement."
        )

    return {
        "type": "score_disagreement",
        "suggestion": " ".join(suggestion_parts),
        "evidence": {
            "flagged_count": len(flagged_cases),
            "ai_higher_than_professor": len(high_ai_cases),
            "ai_lower_than_professor": len(low_ai_cases),
            "affected_students": [
                case.get("student_id")
                for case in flagged_cases
                if case.get("student_id")
            ],
        },
    }


def _build_revision_justification(
    common_mistakes: list[dict],
    flagged_cases: list[dict],
    instructor_note: str | None,
) -> str:
    reasons = []

    if common_mistakes:
        reasons.append(f"{len(common_mistakes)} recurring mistake pattern(s) were detected.")

    if flagged_cases:
        reasons.append(
            f"{len(flagged_cases)} AI/professor disagreement case(s) exceeded the threshold."
        )

    if instructor_note:
        reasons.append("An instructor note requested additional rubric clarification.")

    return " ".join(reasons)