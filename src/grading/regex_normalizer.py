from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class NormalizationResult:
    raw: str
    normalized: str
    notes: list[str]
    looks_like_set_notation: bool
    looks_like_prose: bool
    unsupported_features: list[str]


POWER_PATTERN = re.compile(r"([ab])\^(\d+)")
GROUP_POWER_PATTERN = re.compile(r"(\([^\(\)]+\))\^(\d+)")
AT_LEAST_PATTERN = re.compile(r"([ab\)])\{(\d+),\}")


def expand_symbol_powers(expr: str) -> tuple[str, list[str]]:
    notes: list[str] = []

    def repl(match: re.Match[str]) -> str:
        symbol = match.group(1)
        power = int(match.group(2))
        return symbol * power

    new_expr = POWER_PATTERN.sub(repl, expr)
    if new_expr != expr:
        notes.append("Expanded simple symbol powers like a^3 -> aaa.")
    return new_expr, notes


def expand_group_powers(expr: str) -> tuple[str, list[str]]:
    """
    Expand simple group powers like (a|b)^4 -> (a|b)(a|b)(a|b)(a|b)
    Only handles flat parenthesized groups without nested parentheses.
    """
    notes: list[str] = []

    while True:
        match = GROUP_POWER_PATTERN.search(expr)
        if not match:
            break

        group = match.group(1)
        power = int(match.group(2))
        expanded = group * power
        expr = expr[:match.start()] + expanded + expr[match.end():]
        notes.append(f"Expanded group power {group}^{power}.")

    return expr, notes


def convert_at_least_quantifiers(expr: str) -> tuple[str, list[str], list[str]]:
    """
    Convert very simple forms like:
      b{2,} -> bb+
      (after one pass, Python regex can still interpret +)
    For cases like (a|b){4,}, we deliberately leave unsupported unless already expanded.
    """
    notes: list[str] = []
    unsupported: list[str] = []

    def repl(match: re.Match[str]) -> str:
        token = match.group(1)
        n = int(match.group(2))

        if token in {"a", "b"}:
            notes.append(f"Converted {token}{{{n},}} into repeated form.")
            return token * n + f"{token}*"

        unsupported.append(match.group(0))
        return match.group(0)

    new_expr = AT_LEAST_PATTERN.sub(repl, expr)
    return new_expr, notes, unsupported


def normalize_common_symbols(expr: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    s = expr.strip()

    replacements = [
        ("∪", "|"),
        ("∨", "|"),
        ("Σ*", "(a|b)*"),
        ("sigma*", "(a|b)*"),
        ("ε", ""),
        ("λ", ""),
        ("lambda", ""),
    ]

    for old, new in replacements:
        if old in s:
            s = s.replace(old, new)
            notes.append(f"Replaced '{old}' with '{new}'.")

    s_no_space = re.sub(r"\s+", "", s)
    if s_no_space != s:
        notes.append("Removed whitespace.")
        s = s_no_space

    return s, notes


def detect_set_notation(expr: str) -> bool:
    indicators = ["\\{", "{", "}", "\\", "setminus"]
    return any(tok in expr for tok in indicators)


def detect_prose(expr: str) -> bool:
    lowered = expr.lower()
    prose_markers = [
        "except",
        "allstrings",
        "beginswith",
        "endswith",
        "contains",
        "atleast",
        "exactly",
        "everyoddposition",
        "anystring",
        ";",
    ]
    compact = lowered.replace(" ", "")
    return any(marker in compact for marker in prose_markers)


def detect_unsupported_features(expr: str) -> list[str]:
    unsupported: list[str] = []

    if "..." in expr:
        unsupported.append("ellipsis")
    if "…" in expr:
        unsupported.append("unicode_ellipsis")

    return unsupported


def normalize_regex(expr: str) -> NormalizationResult:
    raw = expr or ""
    stripped = raw.strip()

    if not stripped:
        return NormalizationResult(
            raw=raw,
            normalized="",
            notes=["Answer is empty."],
            looks_like_set_notation=False,
            looks_like_prose=False,
            unsupported_features=[],
        )

    looks_like_set_notation = detect_set_notation(stripped)
    looks_like_prose = detect_prose(stripped)

    normalized, notes = normalize_common_symbols(stripped)

    normalized, power_notes = expand_symbol_powers(normalized)
    notes.extend(power_notes)

    normalized, group_power_notes = expand_group_powers(normalized)
    notes.extend(group_power_notes)

    normalized, quantifier_notes, quantifier_unsupported = convert_at_least_quantifiers(normalized)
    notes.extend(quantifier_notes)

    normalized = normalized.replace("||", "|")

    unsupported_features = detect_unsupported_features(normalized)
    unsupported_features.extend(quantifier_unsupported)

    return NormalizationResult(
        raw=raw,
        normalized=normalized,
        notes=notes,
        looks_like_set_notation=looks_like_set_notation,
        looks_like_prose=looks_like_prose,
        unsupported_features=unsupported_features,
    )