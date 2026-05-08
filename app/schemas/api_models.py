from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class GradeRequest(BaseModel):
    student_id: str
    answer: str
    question_id: str = "Q1"


class BatchGradeRequest(BaseModel):
    submissions: List[GradeRequest]


class GradeResult(BaseModel):
    student_id: str
    question_id: str
    score: float
    max_score: float
    confidence: float
    review_required: bool
    review_reason: str
    reasoning: str


class ReviewQueueItem(BaseModel):
    student_id: str
    question_id: str
    score: float
    confidence: float
    reason: str


class BatchGradeResponse(BaseModel):
    count: int
    average_score: float
    review_count: int
    review_queue: List[ReviewQueueItem]
    results: List[GradeResult]


# ---------------------------------------------------------------------
# First-round survey: comments only, no exact grade
# ---------------------------------------------------------------------


class SurveyBatchRequest(BaseModel):
    question_id: str = "Q1"
    question_text: Optional[str] = None
    rubric: Optional[Any] = None
    solution: Optional[str] = None
    submissions: List[GradeRequest]


class SurveyCommentResult(BaseModel):
    student_id: str
    question_id: str
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    mistake_tags: List[str] = Field(default_factory=list)
    comment: str
    review_required: bool = False


class SurveyBatchResponse(BaseModel):
    question_id: str
    count: int
    results: List[SurveyCommentResult]


# ---------------------------------------------------------------------
# Common mistake statistics
# ---------------------------------------------------------------------


class MistakeStatsRequest(BaseModel):
    question_id: str = "Q1"
    survey_results: List[SurveyCommentResult]


class MistakeCluster(BaseModel):
    tag: str
    count: int
    percentage: float
    affected_students: List[str] = Field(default_factory=list)
    description: str = ""


class MistakeStatsResponse(BaseModel):
    question_id: str
    total_submissions: int
    common_mistakes: List[MistakeCluster]


# ---------------------------------------------------------------------
# Rubric revision
# ---------------------------------------------------------------------


class RubricRevisionRequest(BaseModel):
    question_id: str = "Q1"
    original_rubric: Any
    mistake_stats: Optional[MistakeStatsResponse] = None
    instructor_note: Optional[str] = None


class RubricChangeLogItem(BaseModel):
    old: Optional[str] = None
    new: Optional[str] = None
    justification: str


class RubricRevisionResponse(BaseModel):
    question_id: str
    revision_needed: bool
    revised_rubric: Any
    change_log: List[RubricChangeLogItem] = Field(default_factory=list)
    justification: str


# ---------------------------------------------------------------------
# Ground-truth evaluation
# ---------------------------------------------------------------------


class ProfessorGradeInput(BaseModel):
    student_id: str
    question_id: str = "Q1"
    score: float
    max_score: float = 10
    comment: Optional[str] = None


class ScoreComparisonItem(BaseModel):
    student_id: str
    question_id: str
    ai_score: float
    professor_score: float
    difference: float
    abs_difference: float
    flagged: bool
    ai_reasoning: Optional[str] = None
    professor_comment: Optional[str] = None


class EvaluationMetrics(BaseModel):
    mse: float
    mae: float
    score_variance: float
    error_variance: float
    within_threshold_rate: float
    cosine_similarity_mean: Optional[float] = None
    bert_similarity_mean: Optional[float] = None


class EvaluationRequest(BaseModel):
    ai_results: List[GradeResult]
    professor_grades: List[ProfessorGradeInput]
    difference_threshold: float = 0.5
    include_semantic_metrics: bool = True


class EvaluationResponse(BaseModel):
    count: int
    metrics: EvaluationMetrics
    flagged_count: int
    flagged_cases: List[ScoreComparisonItem]
    comparisons: List[ScoreComparisonItem]


# ---------------------------------------------------------------------
# 5-round rubric calibration
# ---------------------------------------------------------------------


class CalibrationRequest(BaseModel):
    question_id: str = "Q1"
    question_text: Optional[str] = None
    original_rubric: Any
    solution: Optional[str] = None
    submissions: List[GradeRequest]
    professor_grades: List[ProfessorGradeInput]
    max_rounds: int = 5
    difference_threshold: float = 0.5
    target_mse: Optional[float] = None
    min_improvement: float = 0.01
    include_semantic_metrics: bool = True


class CalibrationRoundResult(BaseModel):
    round_index: int
    rubric: Any
    grade_results: List[GradeResult]
    evaluation: EvaluationResponse
    revision_note: Optional[str] = None


class CalibrationResponse(BaseModel):
    question_id: str
    max_rounds: int
    completed_rounds: int
    best_round_index: int
    best_mse: float
    best_rubric: Any
    rounds: List[CalibrationRoundResult]
    stopping_reason: str