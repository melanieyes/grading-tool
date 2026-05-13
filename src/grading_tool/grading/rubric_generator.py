from __future__ import annotations

from typing import Any

from src.grading_tool.models.gemini_client import GeminiClient


SYSTEM_PROMPT = (
    "You are an expert instructor designing grading rubrics. "
    "Given a question, its max score, and (optionally) a reference solution, "
    "produce a concise scoring rubric that a teaching assistant can apply "
    "consistently.\n\n"
    "Rules:\n"
    "- Output 3 to 5 criteria.\n"
    "- Each criterion has a short name, a description, and a max point value.\n"
    "- The criteria max points MUST sum exactly to the provided max_score.\n"
    "- Include short guidance for full credit, partial credit, and low credit.\n"
    "- If a reference solution is supplied, anchor the criteria to its key ideas.\n"
    "- Do not invent facts not implied by the question or solution.\n"
    "- Return ONLY JSON matching the schema below."
)


RESPONSE_SCHEMA_HINT = {
    "criteria": [
        {"name": "string", "description": "string", "max_points": "number"},
    ],
    "full_credit": "string",
    "partial_credit": "string",
    "low_credit": "string",
    "manual_review_trigger": "string",
}


REVISE_SYSTEM_PROMPT_BASE = (
    "You are an expert instructor REVISING an existing grading rubric. "
    "You receive a question, its current rubric (as text), the reviewer's revision "
    "focus / complaint, and the max score. Produce a meaningfully improved rubric.\n\n"
    "Rules:\n"
    "- Preserve criteria that are already clear and useful; only change what the reviewer's focus implies should change.\n"
    "- Address the reviewer's focus DIRECTLY in the revised criteria, descriptions, or partial-credit guidance.\n"
    "- Keep 3 to 5 criteria total. Each has a name, description, and max_points.\n"
    "- Max points MUST sum exactly to the provided max_score.\n"
    "- Do not output the same wording as the original rubric — every revision must be visibly different.\n"
    "- Return ONLY JSON matching the schema."
)

# Appended to the base prompt when a reference solution is available. This
# instructs the LLM to anchor partial credit to specific solution components,
# which is what enables proportional grading for "close-but-not-complete"
# answers vs zero for blank/off-topic answers.
REVISE_WITH_SOLUTION_INSTRUCTIONS = (
    "\n\nIMPORTANT — a reference solution is provided. Use it to anchor partial credit:\n"
    "- First, identify the KEY CONCEPTS, STEPS, or KEYWORDS in the reference solution.\n"
    "- Each rubric criterion must map to one or more of those solution components.\n"
    "- Describe what a FULL-credit, PARTIAL-credit, and NO-credit answer looks like in "
    "terms of those components — e.g. 'mentions component X and explains why' (full), "
    "'mentions component X but does not explain' (partial), 'no mention of any component' (no credit).\n"
    "- A blank, off-topic, or contradictory answer receives 0 — state this explicitly.\n"
    "- An answer that mentions correct keywords or partial steps but does not complete "
    "the solution should receive proportional partial credit based on how many components "
    "are present.\n"
    "- The 'description' field of each criterion should reference specific solution "
    "components by name where possible."
)


class RubricGenerator:
    def __init__(self, model_name: str | None = None, api_key: str | None = None):
        self.client = GeminiClient(model_name=model_name, api_key=api_key)

    def generate(
        self,
        question_text: str,
        max_score: float,
        reference_solution: str | None = None,
    ) -> dict[str, Any]:
        payload = {
            "question_text": question_text,
            "max_score": max_score,
            "reference_solution": reference_solution or None,
            "response_schema": RESPONSE_SCHEMA_HINT,
        }

        raw = self.client.generate_json(SYSTEM_PROMPT, payload)
        return _normalize_rubric(raw, max_score)

    def revise(
        self,
        question_text: str,
        current_rubric_text: str,
        revision_focus: str,
        max_score: float,
        reference_solution: str | None = None,
    ) -> dict[str, Any]:
        # Append solution-anchoring instructions only when a real solution is provided.
        system_prompt = REVISE_SYSTEM_PROMPT_BASE
        if reference_solution and reference_solution.strip():
            system_prompt = system_prompt + REVISE_WITH_SOLUTION_INSTRUCTIONS

        payload = {
            "question_text": question_text,
            "current_rubric": current_rubric_text,
            "revision_focus": revision_focus,
            "max_score": max_score,
            "reference_solution": reference_solution or None,
            "response_schema": RESPONSE_SCHEMA_HINT,
        }

        raw = self.client.generate_json(system_prompt, payload)
        return _normalize_rubric(raw, max_score)


def _normalize_rubric(raw: Any, max_score: float) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("Rubric generator returned a non-object response.")

    criteria_raw = raw.get("criteria") or []
    if not isinstance(criteria_raw, list) or not criteria_raw:
        raise ValueError("Rubric generator returned no criteria.")

    criteria: list[dict[str, Any]] = []
    for idx, item in enumerate(criteria_raw, start=1):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or f"Criterion {idx}").strip()
        description = str(item.get("description") or "").strip()
        try:
            points = float(item.get("max_points", 0))
        except (TypeError, ValueError):
            points = 0.0
        criteria.append({"name": name, "description": description, "max_points": points})

    total = sum(c["max_points"] for c in criteria)
    if total <= 0:
        equal = max_score / max(len(criteria), 1)
        for c in criteria:
            c["max_points"] = equal
    elif abs(total - max_score) > 0.01:
        scale = max_score / total
        for c in criteria:
            c["max_points"] = round(c["max_points"] * scale, 2)

    return {
        "criteria": criteria,
        "full_credit": str(raw.get("full_credit") or "").strip(),
        "partial_credit": str(raw.get("partial_credit") or "").strip(),
        "low_credit": str(raw.get("low_credit") or "").strip(),
        "manual_review_trigger": str(raw.get("manual_review_trigger") or "").strip(),
    }


def format_rubric_as_text(rubric: dict[str, Any]) -> str:
    lines: list[str] = []
    for c in rubric.get("criteria", []):
        name = c.get("name") or "Criterion"
        desc = c.get("description") or ""
        pts = c.get("max_points", 0)
        pts_str = str(int(pts)) if float(pts).is_integer() else f"{float(pts):.2f}"
        body = f"- {name} (0-{pts_str})"
        if desc:
            body += f": {desc}"
        lines.append(body)

    if rubric.get("full_credit"):
        lines.append(f"- Full credit: {rubric['full_credit']}")
    if rubric.get("partial_credit"):
        lines.append(f"- Partial credit: {rubric['partial_credit']}")
    if rubric.get("low_credit"):
        lines.append(f"- Low credit: {rubric['low_credit']}")
    if rubric.get("manual_review_trigger"):
        lines.append(f"- Manual review trigger: {rubric['manual_review_trigger']}")

    return "\n".join(lines)
