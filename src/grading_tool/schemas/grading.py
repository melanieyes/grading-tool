from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class CriterionResult(BaseModel):
    criterion_id: str
    awarded_points: float
    max_points: float
    justification: str


class QuestionGradeResult(BaseModel):
    student_id: str
    question_id: str
    benchmark_type: str
    score_awarded: float
    score_max: float
    criterion_results: List[CriterionResult]
    feedback: str
    confidence: float
    review_required: bool
    raw_response: Optional[dict] = None


class BatchGradeResult(BaseModel):
    run_name: str
    results: List[QuestionGradeResult]