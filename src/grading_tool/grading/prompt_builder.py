from __future__ import annotations

import yaml

from src.grading_tool.grading.question_type_router import build_question_type_guidance


def load_prompt_config(config_path: str = "configs/prompts.yaml") -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)["prompts"]


def build_system_prompt(prompt_name: str, prompt_cfg: dict) -> str:
    style = prompt_cfg["style"]
    rubric_mode = prompt_cfg["rubric_mode"]
    allow_implicit_reasoning = prompt_cfg.get("allow_implicit_reasoning", False)
    partial_credit_style = prompt_cfg.get("partial_credit_style", "strict")
    grader_note = prompt_cfg.get("grader_note", "").strip()

    common = (
        "You are a strict but fair grading assistant.\n"
        "You must grade a student answer using the provided rubric as the main authority.\n"
        "Score each rubric criterion independently.\n"
        "Do not reward unsupported claims.\n"
        "Return JSON only.\n"
    )

    if style == "short":
        style_text = (
            "Be concise and direct.\n"
            "Focus tightly on explicit rubric evidence.\n"
        )
    elif style == "structured":
        style_text = (
            "Be structured and explicit.\n"
            "For each criterion, explain briefly why points were or were not awarded.\n"
        )
    elif style == "detailed":
        style_text = (
            "Be careful and professor-like.\n"
            "Distinguish complete correctness, partial understanding, and conceptual error.\n"
        )
    elif style == "strict_conservative":
        style_text = (
            "Be conservative.\n"
            "If the answer is vague, incomplete, or directionally confused, reduce points.\n"
            "Prefer review_required=true when uncertainty is meaningful.\n"
        )
    else:
        style_text = ""

    if rubric_mode == "criterion_only":
        rubric_text = (
            "Grade criterion by criterion.\n"
            "Do not award points unless the answer supports the criterion.\n"
        )
    else:
        rubric_text = (
            "Grade criterion by criterion, but also consider the coherence of the full reasoning.\n"
            "Award partial credit when the student shows the right underlying idea, even if execution is incomplete.\n"
        )

    if allow_implicit_reasoning:
        implicit_text = (
            "You may award credit when a reasoning step is clearly implied by the student's explanation, "
            "even if not stated in textbook wording.\n"
            "Do not require exact phrasing when the intended concept is clearly correct.\n"
        )
    else:
        implicit_text = (
            "Award credit only when the criterion is explicitly supported by the answer.\n"
            "Do not infer missing reasoning steps unless they are directly stated.\n"
        )

    if partial_credit_style == "generous":
        partial_text = (
            "Use partial credit generously when the student has the correct direction and most of the reasoning.\n"
        )
    elif partial_credit_style == "moderate":
        partial_text = (
            "Use partial credit when the student demonstrates substantial understanding but misses some detail.\n"
        )
    else:
        partial_text = (
            "Use partial credit conservatively.\n"
        )

    grader_note_text = f"{grader_note}\n" if grader_note else ""

    schema = """
Required JSON format:
{
  "criterion_results": [
    {
      "criterion_id": "string",
      "awarded_points": 0,
      "max_points": 0,
      "justification": "string"
    }
  ],
  "feedback": "string",
  "confidence": 0.0,
  "review_required": false
}
"""

    return (
        common
        + style_text
        + rubric_text
        + implicit_text
        + partial_text
        + grader_note_text
        + schema
    )


def build_payload(
    prompt_name: str,
    benchmark_type: str,
    question_text: str,
    rubric: dict,
    student_answer: str,
    reference_solution: str | None = None,
    config_path: str = "configs/prompts.yaml",
) -> tuple[str, dict]:
    prompts = load_prompt_config(config_path)
    prompt_cfg = prompts[prompt_name]
    system_prompt = build_system_prompt(prompt_name, prompt_cfg)

    payload = {
        "prompt_name": prompt_name,
        "benchmark_type": benchmark_type,
        "grading_guidance": build_question_type_guidance(benchmark_type),
        "question_text": question_text,
        "rubric": rubric,
        "student_answer": student_answer,
    }

    if prompt_cfg.get("allow_reference_solution", False):
        payload["reference_solution"] = reference_solution

    return system_prompt, payload