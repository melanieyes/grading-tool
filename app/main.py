from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.health import router as health_router
from app.routes.runs import router as runs_router
from app.routes.grading import router as grading_router

app = FastAPI(title="Fulbright Grade Master API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Fulbright Grade Master API is running"}

app.include_router(health_router)
app.include_router(runs_router)
app.include_router(grading_router)