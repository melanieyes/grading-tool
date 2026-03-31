from __future__ import annotations

from typing import List
from pydantic import BaseModel


class PerQuestionMetric(BaseModel):
    question_id: str
    mae: float
    exact_match_rate: float
    n: int


class EvaluationSummary(BaseModel):
    run_name: str
    n_graded: int
    mae: float
    exact_match_rate: float
    pearson_correlation: float
    spearman_correlation: float
    per_question: List[PerQuestionMetric]