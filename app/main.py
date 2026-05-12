from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.health import router as health_router
from app.routes.runs import router as runs_router
from app.routes.grading import router as grading_router
from app.routes.evaluation import router as evaluation_router

app = FastAPI(title="Fulbright Grade Master API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:4173",
        "https://grading-tool-beige.vercel.app",
        "https://grading-tool-ruby.vercel.app",
    ],
    # Allow Vercel deployments + local dev server accessed via LAN IP.
    # This prevents CORS preflight failures when Vite is opened at e.g. http://10.x.x.x:5173
    allow_origin_regex=(
        r"^(https://.*\.vercel\.app|"
        r"http://(localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"100\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})"
        r":(5173|5174))$"
    ),
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
app.include_router(evaluation_router)