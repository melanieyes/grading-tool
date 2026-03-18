from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from itertools import product
from typing import Callable

from src.grading.regex_normalizer import normalize_regex


@dataclass
class DeterministicCheckResult:
    status: str
    score: float
    confidence: float
    grading_method: str
    reasoning_summary: str
    normalized_student_answer: str
    normalized_reference_answer: str | None
    feedback: str
    false_positives: list[str]
    false_negatives: list[str]
    notes: list[str]
    used_reference_regex: bool
    used_predicate: bool

    def to_dict(self) -> dict:
        return asdict(self)


def all_binary_strings(max_len: int) -> list[str]:
    strings = [""]
    for n in range(1, max_len + 1):
        for tup in product("ab", repeat=n):
            strings.append("".join(tup))
    return strings


def compile_regex(pattern: str) -> re.Pattern[str]:
    return re.compile(rf"^(?:{pattern})$")


def run_regex_against_strings(pattern: str, strings: list[str]) -> set[str]:
    compiled = compile_regex(pattern)
    accepted = set()

    for s in strings:
        if compiled.fullmatch(s):
            accepted.add(s)

    return accepted


def run_predicate_against_strings(
    predicate: Callable[[str], bool],
    strings: list[str],
) -> set[str]:
    return {s for s in strings if predicate(s)}


def compare_languages(
    student_pattern: str,
    strings: list[str],
    reference_pattern: str | None = None,
    reference_predicate: Callable[[str], bool] | None = None,
) -> tuple[list[str], list[str], bool, bool]:
    student_accepts = run_regex_against_strings(student_pattern, strings)

    if reference_pattern:
        reference_accepts = run_regex_against_strings(reference_pattern, strings)
        used_reference_regex = True
        used_predicate = False
    elif reference_predicate:
        reference_accepts = run_predicate_against_strings(reference_predicate, strings)
        used_reference_regex = False
        used_predicate = True
    else:
        raise ValueError("Either reference_pattern or reference_predicate must be provided.")

    false_positives = sorted(student_accepts - reference_accepts, key=lambda x: (len(x), x))
    false_negatives = sorted(reference_accepts - student_accepts, key=lambda x: (len(x), x))

    return false_positives, false_negatives, used_reference_regex, used_predicate


def compute_confidence(
    status: str,
    used_reference_regex: bool,
    used_predicate: bool,
) -> float:
    if status == "correct" and used_reference_regex and used_predicate:
        return 0.99
    if status == "correct" and (used_reference_regex or used_predicate):
        return 0.95
    if status == "incorrect":
        return 0.98
    if status == "invalid_regex":
        return 0.90
    if status == "unsupported_notation":
        return 0.45
    if status == "empty":
        return 0.99
    return 0.50


def build_reasoning_summary(
    status: str,
    used_reference_regex: bool,
    used_predicate: bool,
    false_positives: list[str],
    false_negatives: list[str],
) -> str:
    if status == "correct":
        if used_reference_regex and used_predicate:
            return "The answer matched the reference regex and language predicate on all tested strings."
        if used_reference_regex:
            return "The answer matched the reference regex on all tested strings."
        if used_predicate:
            return "The answer matched the target language predicate on all tested strings."
        return "The answer was graded as correct."

    if status == "incorrect":
        parts = ["The answer differed from the target language on the tested strings."]
        if false_positives:
            parts.append(f"It overgenerated examples such as {false_positives[:3]}.")
        if false_negatives:
            parts.append(f"It missed examples such as {false_negatives[:3]}.")
        return " ".join(parts)

    if status == "invalid_regex":
        return "The answer could not be compiled as a valid regex."

    if status == "unsupported_notation":
        return "The answer appears to use unsupported notation or prose, so deterministic regex checking was skipped."

    if status == "empty":
        return "No answer was provided."

    return "The result was produced by deterministic grading."


def grade_regex_deterministically(
    student_answer: str,
    max_len: int = 10,
    reference_answer: str | None = None,
    reference_predicate: Callable[[str], bool] | None = None,
    max_examples: int = 10,
) -> DeterministicCheckResult:
    student_norm = normalize_regex(student_answer)
    reference_norm = normalize_regex(reference_answer) if reference_answer else None

    notes = list(student_norm.notes)

    if reference_norm:
        notes.extend([f"Reference: {n}" for n in reference_norm.notes])

    if not student_norm.normalized:
        status = "empty"
        return DeterministicCheckResult(
            status=status,
            score=0.0,
            confidence=compute_confidence(status, False, False),
            grading_method="deterministic",
            reasoning_summary=build_reasoning_summary(status, False, False, [], []),
            normalized_student_answer="",
            normalized_reference_answer=reference_norm.normalized if reference_norm else None,
            feedback="No answer provided.",
            false_positives=[],
            false_negatives=[],
            notes=notes,
            used_reference_regex=False,
            used_predicate=False,
        )

    if student_norm.looks_like_set_notation:
        status = "unsupported_notation"
        notes.append("Student answer appears to use set notation; deterministic regex checker skipped.")
        return DeterministicCheckResult(
            status=status,
            score=0.0,
            confidence=compute_confidence(status, False, False),
            grading_method="deterministic",
            reasoning_summary=build_reasoning_summary(status, False, False, [], []),
            normalized_student_answer=student_norm.normalized,
            normalized_reference_answer=reference_norm.normalized if reference_norm else None,
            feedback="Answer uses set notation rather than plain regex. Needs fallback grading.",
            false_positives=[],
            false_negatives=[],
            notes=notes,
            used_reference_regex=False,
            used_predicate=False,
        )

    if student_norm.looks_like_prose:
        status = "unsupported_notation"
        notes.append("Student answer appears to be prose; deterministic regex checker skipped.")
        return DeterministicCheckResult(
            status=status,
            score=0.0,
            confidence=compute_confidence(status, False, False),
            grading_method="deterministic",
            reasoning_summary=build_reasoning_summary(status, False, False, [], []),
            normalized_student_answer=student_norm.normalized,
            normalized_reference_answer=reference_norm.normalized if reference_norm else None,
            feedback="Answer appears to be prose rather than a regex. Needs fallback grading.",
            false_positives=[],
            false_negatives=[],
            notes=notes,
            used_reference_regex=False,
            used_predicate=False,
        )

    strings = all_binary_strings(max_len)

    try:
        false_positives, false_negatives, used_reference_regex, used_predicate = compare_languages(
            student_pattern=student_norm.normalized,
            strings=strings,
            reference_pattern=reference_norm.normalized if reference_norm else None,
            reference_predicate=reference_predicate,
        )
    except re.error as e:
        status = "invalid_regex"
        notes.append(f"Regex compilation error: {e}")
        return DeterministicCheckResult(
            status=status,
            score=0.0,
            confidence=compute_confidence(status, False, False),
            grading_method="deterministic",
            reasoning_summary=build_reasoning_summary(status, False, False, [], []),
            normalized_student_answer=student_norm.normalized,
            normalized_reference_answer=reference_norm.normalized if reference_norm else None,
            feedback=f"Invalid regex syntax: {e}",
            false_positives=[],
            false_negatives=[],
            notes=notes,
            used_reference_regex=False,
            used_predicate=False,
        )

    if not false_positives and not false_negatives:
        status = "correct"
        return DeterministicCheckResult(
            status=status,
            score=1.0,
            confidence=compute_confidence(status, used_reference_regex, used_predicate),
            grading_method="deterministic",
            reasoning_summary=build_reasoning_summary(
                status, used_reference_regex, used_predicate, false_positives, false_negatives
            ),
            normalized_student_answer=student_norm.normalized,
            normalized_reference_answer=reference_norm.normalized if reference_norm else None,
            feedback="Correct within bounded exhaustive checking.",
            false_positives=[],
            false_negatives=[],
            notes=notes,
            used_reference_regex=used_reference_regex,
            used_predicate=used_predicate,
        )

    status = "incorrect"
    feedback_parts = ["Incorrect within bounded exhaustive checking."]
    if false_positives:
        feedback_parts.append(f"Matches strings it should not: {false_positives[:max_examples]}")
    if false_negatives:
        feedback_parts.append(f"Misses strings it should match: {false_negatives[:max_examples]}")

    return DeterministicCheckResult(
        status=status,
        score=0.0,
        confidence=compute_confidence(status, used_reference_regex, used_predicate),
        grading_method="deterministic",
        reasoning_summary=build_reasoning_summary(
            status, used_reference_regex, used_predicate, false_positives, false_negatives
        ),
        normalized_student_answer=student_norm.normalized,
        normalized_reference_answer=reference_norm.normalized if reference_norm else None,
        feedback=" ".join(feedback_parts),
        false_positives=false_positives[:max_examples],
        false_negatives=false_negatives[:max_examples],
        notes=notes,
        used_reference_regex=used_reference_regex,
        used_predicate=used_predicate,
    )