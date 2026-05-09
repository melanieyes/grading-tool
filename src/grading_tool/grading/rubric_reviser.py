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

        if tag == "ai_overscoring":
            suggestion = (
                "Tighten scoring: only award points when the criterion is explicitly and "
                "clearly addressed. Reduce or withhold partial credit for vague or incomplete answers."
            )
        elif tag == "ai_underscoring":
            suggestion = (
                "Relax scoring: award partial credit when the student demonstrates the "
                "underlying concept, even if the exact terminology or full derivation is missing."
            )
        else:
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

    calibration_guidance = _build_calibration_guidance(common_mistakes, flagged_cases)
    if calibration_guidance:
        existing_note = str(revised_rubric.get("grading_note") or "").strip()
        # Strip any CALIBRATION NOTE prepended in a previous round so they don't stack
        clean_note = "\n\n".join(
            part for part in existing_note.split("\n\n")
            if not part.startswith("CALIBRATION NOTE")
        ).strip()
        revised_rubric["grading_note"] = (
            f"{calibration_guidance}\n\n{clean_note}" if clean_note else calibration_guidance
        )
        revised_rubric["calibration_guidance"] = calibration_guidance

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


def _score_severity(avg_diff: float) -> dict:
    """Return severity-scaled wording based on the magnitude of the average score gap."""
    magnitude = abs(avg_diff)
    if magnitude >= 20:
        return {
            "strict_word": "VERY STRICTLY",
            "strict_detail": (
                "Only award points for criteria that are explicitly, completely, and correctly addressed. "
                "Do not award partial credit unless the student demonstrates clear understanding."
            ),
            "generous_word": "VERY GENEROUSLY",
            "generous_detail": (
                "Award most available points when the student demonstrates the correct approach or concept, "
                "even if the implementation is incomplete or terminology imprecise."
            ),
        }
    if magnitude >= 8:
        return {
            "strict_word": "STRICTLY",
            "strict_detail": (
                "Only award points when the criterion is explicitly and clearly addressed. "
                "Err toward deducting rather than awarding on borderline answers."
            ),
            "generous_word": "GENEROUSLY",
            "generous_detail": (
                "Award partial credit when the student demonstrates the underlying concept or correct "
                "reasoning direction, even if exact terminology or full derivation is missing."
            ),
        }
    return {
        "strict_word": "SLIGHTLY MORE STRICTLY",
        "strict_detail": "Reduce partial credit for answers that are vague or only partially correct.",
        "generous_word": "SLIGHTLY MORE GENEROUSLY",
        "generous_detail": "Award partial credit when the student shows the right direction, even if incomplete.",
    }


def _build_calibration_guidance(
    common_mistakes: list[dict],
    flagged_cases: list[dict],
) -> str | None:
    """Build directive grading guidance for the LLM based on the direction of score error.

    Prepended to grading_note so the LLM sees it as a primary rubric instruction,
    not a buried annotation.
    """
    parts: list[str] = []

    for mistake in common_mistakes:
        tag = mistake.get("tag")
        count = mistake.get("count", 0)
        avg_diff = float(mistake.get("avg_diff", 0.0))

        if tag == "ai_overscoring":
            severity = _score_severity(avg_diff)
            parts.append(
                f"CALIBRATION NOTE ({count} flagged submission(s), avg excess +{avg_diff:.2f} pts): "
                f"Apply criteria {severity['strict_word']}. "
                f"{severity['strict_detail']}"
            )
        elif tag == "ai_underscoring":
            severity = _score_severity(avg_diff)
            parts.append(
                f"CALIBRATION NOTE ({count} flagged submission(s), avg deficit {abs(avg_diff):.2f} pts): "
                f"Apply criteria {severity['generous_word']}. "
                f"{severity['generous_detail']}"
            )

    if not parts and flagged_cases:
        n_high = sum(1 for c in flagged_cases if float(c.get("difference", 0)) > 0)
        n_low = sum(1 for c in flagged_cases if float(c.get("difference", 0)) < 0)
        if n_high > n_low:
            parts.append(
                "CALIBRATION NOTE: Recent AI scores exceeded professor scores. Apply criteria more strictly."
            )
        elif n_low > n_high:
            parts.append(
                "CALIBRATION NOTE: Recent AI scores fell below professor scores. Apply criteria more generously."
            )

    return " ".join(parts) if parts else None


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