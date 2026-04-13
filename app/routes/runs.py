from fastapi import APIRouter

router = APIRouter()

@router.get("/api/runs")
def get_runs():
    return [
        {
            "run_name": "prompt_v1_demo",
            "prompt_name": "prompt_v1",
            "model_name": "gemini",
            "mae": 1.25,
            "exact_match": 42.0,
            "pearson": 0.74,
            "spearman": 0.71,
        },
        {
            "run_name": "prompt_v2_demo",
            "prompt_name": "prompt_v2",
            "model_name": "gemini",
            "mae": 0.95,
            "exact_match": 51.0,
            "pearson": 0.81,
            "spearman": 0.79,
        },
    ]