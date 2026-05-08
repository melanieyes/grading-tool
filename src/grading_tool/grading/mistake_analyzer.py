"""Utilities to analyze mistakes between student answers and reference solutions.

Lightweight heuristics suitable for offline analysis and unit tests.
"""
from difflib import SequenceMatcher
from typing import List, Dict


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
