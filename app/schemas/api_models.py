from pydantic import BaseModel
from typing import List


class GradeRequest(BaseModel):
    student_id: str
    answer: str


class BatchGradeRequest(BaseModel):
    submissions: List[GradeRequest]


class GradeResult(BaseModel):
    student_id: str
    question_id: str
    score: int
    max_score: int
    confidence: float
    review_required: bool
    review_reason: str
    reasoning: str


class ReviewQueueItem(BaseModel):
    student_id: str
    question_id: str
    score: int
    confidence: float
    reason: str


class BatchGradeResponse(BaseModel):
    count: int
    average_score: float
    review_count: int
    review_queue: List[ReviewQueueItem]
    results: List[GradeResult]