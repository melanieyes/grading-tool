from fastapi import APIRouter, Request

from app.schemas.api_models import (
    BatchGradeRequest,
    BatchGradeResponse,
    GradeRequest,
    GradeResult,
    MistakeStatsRequest,
    MistakeStatsResponse,
    RubricRevisionRequest,
    RubricRevisionResponse,
    SurveyBatchRequest,
    SurveyBatchResponse,
)
from app.services.grader_service import (
    analyze_mistakes,
    grade_batch,
    revise_rubric,
    score_answer,
    survey_submissions,
)

router = APIRouter()


@router.post("/api/grade", response_model=GradeResult)
def grade_submission(payload: GradeRequest):
    return score_answer(payload.student_id, payload.answer, payload.question_id)


@router.post("/api/grade-batch", response_model=BatchGradeResponse)
def grade_batch_endpoint(payload: BatchGradeRequest, request: Request):
    api_key = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
    if not api_key:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            api_key = auth.split(" ", 1)[1].strip() or None

    return grade_batch(payload.submissions, api_key=api_key)


@router.post("/api/survey-submissions", response_model=SurveyBatchResponse)
def survey_submissions_endpoint(payload: SurveyBatchRequest):
    return survey_submissions(payload)


@router.post("/api/mistake-stats", response_model=MistakeStatsResponse)
def mistake_stats_endpoint(payload: MistakeStatsRequest):
    return analyze_mistakes(payload)


@router.post("/api/revise-rubric", response_model=RubricRevisionResponse)
def revise_rubric_endpoint(payload: RubricRevisionRequest):
    return revise_rubric(payload)