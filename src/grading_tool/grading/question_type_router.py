from __future__ import annotations


def build_question_type_guidance(benchmark_type: str) -> str:
    mapping = {
        "true_false_with_explanation": (
            "Check both the True/False label and the explanation. "
            "Award explanation credit independently when justified by the rubric."
        ),
        "np_membership_proof": (
            "Look for certificate/verifier reasoning and a polynomial-time verification argument."
        ),
        "polynomial_reduction": (
            "Look for source problem, target problem, construction, correctness, and polynomial runtime."
        ),
        "np_completeness_proof": (
            "Look for NP membership, reduction from a known NP-complete problem, correctness, "
            "polynomial runtime, and a valid NP-complete conclusion."
        ),
    }
    return mapping.get(benchmark_type, "Grade strictly according to the rubric.")