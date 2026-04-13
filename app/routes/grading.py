from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter()


class GradeRequest(BaseModel):
    student_id: str
    answer: str


class BatchGradeRequest(BaseModel):
    submissions: List[GradeRequest]


def score_answer(student_id: str, answer: str):
    text = answer.lower()

    score = 5
    confidence = 0.65
    reasoning = "Partial answer detected."
    review_required = False
    review_reason = ""

    if "deadlock" in text:
        score += 2

    if "resource" in text or "circular wait" in text:
        score += 2

    if "prevent" in text or "ordering" in text:
        score += 1

    if len(text.split()) < 8:
        confidence = 0.52
        review_required = True
        review_reason = "Answer too short"

    if score >= 9:
        confidence = 0.90
        reasoning = "Strong answer with correct concepts and prevention strategy."

    elif score >= 7:
        confidence = 0.78
        reasoning = "Good answer but missing some detail."
        review_required = True
        review_reason = "Borderline score"

    else:
        confidence = 0.60
        review_required = True
        review_reason = "Low score"

    return {
        "student_id": student_id,
        "question_id": "Q1",
        "score": score,
        "max_score": 10,
        "confidence": confidence,
        "review_required": review_required,
        "review_reason": review_reason,
        "reasoning": reasoning,
    }


@router.post("/api/grade")
def grade_submission(payload: GradeRequest):
    return score_answer(payload.student_id, payload.answer)


@router.post("/api/grade-batch")
def grade_batch(payload: BatchGradeRequest):
    results = [
        score_answer(item.student_id, item.answer)
        for item in payload.submissions
    ]

    review_queue = [
        {
            "student_id": r["student_id"],
            "question_id": r["question_id"],
            "score": r["score"],
            "confidence": r["confidence"],
            "reason": r["review_reason"],
        }
        for r in results
        if r["review_required"]
    ]

    avg_score = round(
        sum(r["score"] for r in results) / len(results), 2
    )

    return {
        "count": len(results),
        "average_score": avg_score,
        "review_count": len(review_queue),
        "review_queue": review_queue,
        "results": results,
    }