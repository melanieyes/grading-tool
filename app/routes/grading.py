from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class GradeRequest(BaseModel):
    student_id: str
    answer: str


@router.post("/api/grade")
def grade_submission(payload: GradeRequest):
    answer = payload.answer.lower()

    score = 5
    confidence = 0.65
    reasoning = "Partial answer detected."
    review_required = False

    if "deadlock" in answer:
        score += 2

    if "resource" in answer or "circular wait" in answer:
        score += 2

    if "prevent" in answer or "ordering" in answer:
        score += 1

    if len(answer.split()) < 10:
        confidence = 0.45
        review_required = True

    if score >= 9:
        confidence = 0.90
        reasoning = "Strong answer with correct concepts and prevention strategy."
    elif score >= 7:
        confidence = 0.78
        reasoning = "Good answer but missing some detail."

    return {
        "student_id": payload.student_id,
        "score": score,
        "max_score": 10,
        "confidence": confidence,
        "review_required": review_required,
        "reasoning": reasoning,
    }