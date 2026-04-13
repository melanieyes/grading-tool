from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Fulbright Grade Master API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/runs")
def get_runs():
    return [
        {
            "run_name": "demo_run",
            "prompt_name": "prompt_v1",
            "model_name": "gemini",
            "mae": 1.2,
            "pearson": 0.74
        }
    ]