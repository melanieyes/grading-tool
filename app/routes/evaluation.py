from fastapi import APIRouter

from app.schemas.api_models import (
    CalibrationRequest,
    CalibrationResponse,
    EvaluationRequest,
    EvaluationResponse,
)
from app.services.grader_service import (
    calibrate_rubric_rounds,
    evaluate_with_ground_truth,
)

router = APIRouter()


@router.get("/api/evaluation/health")
def evaluation_health_check():
    return {
        "status": "ok",
        "route": "evaluation",
        "message": "Evaluation routes are available.",
    }


@router.post("/api/evaluation/run", response_model=EvaluationResponse)
def run_evaluation(payload: EvaluationRequest):
    """
    Compare AI grading results against professor ground-truth grades.

    Computes:
    - MSE
    - MAE
    - score variance
    - error variance
    - within-threshold rate
    - semantic metrics later: BERT + cosine similarity
    """
    return evaluate_with_ground_truth(payload)


@router.post("/api/evaluation/calibrate", response_model=CalibrationResponse)
def run_calibration(payload: CalibrationRequest):
    """
    Run rubric calibration for up to max_rounds.

    Default max_rounds is 5 from the schema.
    Each round:
    1. grades submissions
    2. compares AI grades with professor grades
    3. computes evaluation metrics
    4. records a rubric revision note
    5. keeps the best round by lowest MSE
    """
    return calibrate_rubric_rounds(payload)