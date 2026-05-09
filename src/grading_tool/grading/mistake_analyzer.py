"""Utilities to analyze mistakes between student answers and reference solutions.

Lightweight heuristics suitable for offline analysis and unit tests.
"""
from difflib import SequenceMatcher
from typing import List, Dict


def analyze_flagged_cases(flagged_cases: list[dict]) -> dict:
    """Convert flagged evaluation cases into mistake_stats for revise_rubric.

    Classifies each flagged case by direction (AI scored too high vs too low),
    computes counts and average discrepancies, and returns a dict in the
    ``{"common_mistakes": [...]}`` shape that revise_rubric expects.
    """
    if not flagged_cases:
        return {}

    total = len(flagged_cases)
    ai_high = [c for c in flagged_cases if float(c.get("difference", 0)) > 0]
    ai_low = [c for c in flagged_cases if float(c.get("difference", 0)) < 0]

    common_mistakes: list[dict] = []

    if ai_high:
        diffs = [float(c.get("difference", 0)) for c in ai_high]
        avg_diff = sum(diffs) / len(diffs)
        common_mistakes.append(
            {
                "tag": "ai_overscoring",
                "count": len(ai_high),
                "percentage": len(ai_high) / total,
                "description": (
                    f"AI scored above professor by an average of {avg_diff:.2f} points "
                    f"in {len(ai_high)} submission(s)."
                ),
                "avg_diff": round(avg_diff, 3),
                "affected_students": [
                    c.get("student_id") for c in ai_high if c.get("student_id")
                ],
            }
        )

    if ai_low:
        diffs = [float(c.get("difference", 0)) for c in ai_low]
        avg_diff = sum(diffs) / len(diffs)
        common_mistakes.append(
            {
                "tag": "ai_underscoring",
                "count": len(ai_low),
                "percentage": len(ai_low) / total,
                "description": (
                    f"AI scored below professor by an average of {abs(avg_diff):.2f} points "
                    f"in {len(ai_low)} submission(s)."
                ),
                "avg_diff": round(avg_diff, 3),
                "affected_students": [
                    c.get("student_id") for c in ai_low if c.get("student_id")
                ],
            }
        )

    return {"common_mistakes": common_mistakes}


def analyze_mistakes(student: str, reference: str, keywords: List[str] | None = None) -> Dict[str, object]:
    """Return a dictionary describing high-level mismatches.

    - `similarity`: sequence-based similarity in [0,1]
    - `missing_keywords`: list of provided keywords not present in student answer
    - `diff_hint`: brief string hint describing where answers differ
    """
    if not student and not reference:
        return {"similarity": 1.0, "missing_keywords": [], "diff_hint": ""}
    matcher = SequenceMatcher(None, student or "", reference or "")
    similarity = matcher.ratio()
    missing = []
    if keywords:
        lower = (student or "").lower()
        for kw in keywords:
            if kw.lower() not in lower:
                missing.append(kw)
    # Provide a short diff hint using opcodes
    ops = matcher.get_opcodes()
    hints = []
    for tag, i1, i2, j1, j2 in ops[:3]:
        hints.append(f"{tag}:{(i2-i1)}->{(j2-j1)}")
    return {"similarity": similarity, "missing_keywords": missing, "diff_hint": ";".join(hints)}
