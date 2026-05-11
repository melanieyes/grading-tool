"""Utilities to analyze mistakes between student answers and reference solutions.

Lightweight heuristics suitable for offline analysis and unit tests.
"""
from __future__ import annotations

import re
from collections import Counter
from difflib import SequenceMatcher
from typing import Dict, List


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
    student_norm = _normalize_text(student)
    reference_norm = _normalize_text(reference)

    if not student_norm and not reference_norm:
        return {
            "similarity": 1.0,
            "missing_keywords": [],
            "diff_hint": "",
            "student_len_tokens": 0,
            "reference_len_tokens": 0,
            "length_ratio": 1.0,
            "auto_keywords": [],
            "missing_auto_keywords": [],
            "extra_student_keywords": [],
            "signals": [],
        }

    matcher = SequenceMatcher(None, student_norm, reference_norm)
    similarity = float(matcher.ratio())

    student_tokens = _tokenize(student_norm)
    reference_tokens = _tokenize(reference_norm)
    student_len = len(student_tokens)
    reference_len = len(reference_tokens)
    length_ratio = (student_len / reference_len) if reference_len else (1.0 if student_len else 0.0)

    student_vocab = set(_candidate_keywords(student_tokens))

    missing: list[str] = []
    if keywords:
        lower = student_norm.lower()
        for kw in keywords:
            if kw and str(kw).lower() not in lower:
                missing.append(str(kw))

    auto_keywords = [] if keywords else extract_keywords(reference_norm)
    missing_auto = [kw for kw in auto_keywords if kw not in student_vocab]

    # Keywords student used that don't appear in the reference.
    reference_vocab = set(_candidate_keywords(reference_tokens))
    extra_student = sorted(student_vocab - reference_vocab)

    ops = matcher.get_opcodes()
    hints: list[str] = []
    for tag, i1, i2, j1, j2 in ops[:4]:
        hints.append(f"{tag}:{(i2 - i1)}->{(j2 - j1)}")

    signals: list[str] = []
    if student_len < 12 and reference_len >= 12:
        signals.append("too_short")
    if similarity < 0.35:
        signals.append("low_similarity")
    if missing_auto:
        signals.append("missing_key_terms")

    return {
        "similarity": similarity,
        "missing_keywords": missing,
        "diff_hint": ";".join(hints),
        "student_len_tokens": student_len,
        "reference_len_tokens": reference_len,
        "length_ratio": round(float(length_ratio), 4),
        "auto_keywords": auto_keywords,
        "missing_auto_keywords": missing_auto,
        "extra_student_keywords": extra_student[:12],
        "signals": signals,
    }


_WORD_RE = re.compile(r"[a-z0-9]+")


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", str(text).strip().lower())


def _tokenize(text: str) -> list[str]:
    if not text:
        return []
    return _WORD_RE.findall(text.lower())


_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "were",
    "with",
}


def _candidate_keywords(tokens: list[str]) -> list[str]:
    return [t for t in tokens if len(t) > 2 and t not in _STOPWORDS and not t.isdigit()]


def extract_keywords(reference_text: str, max_keywords: int = 12) -> list[str]:
    """Extract simple keywords from reference text.

    Returns lowercase tokens (no phrases) suitable for presence/absence checks.
    """
    tokens = _candidate_keywords(_tokenize(_normalize_text(reference_text)))
    if not tokens:
        return []

    counts = Counter(tokens)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))
    return [tok for tok, _ in ranked[:max_keywords]]
