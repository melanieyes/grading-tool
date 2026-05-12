# Getting Started

This guide is for running the grading tool end-to-end in three modes:
- **CLI (Gemini rubric grading)** — the “real” grading pipeline today
- **API (FastAPI)** — backend endpoints used by the frontend
- **Frontend (Vite + React)** — UI workflow demo

## Prerequisites
- Python **3.10+**
- Node.js **18+** (for the frontend)

## 1) Python environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### API dependencies (FastAPI/Uvicorn)
`fastapi` and `uvicorn[standard]` are declared in [pyproject.toml](pyproject.toml), so `pip install -e .` already installs them. Reinstall only if something is broken:

```bash
pip install fastapi uvicorn
```

## 2) Configure Gemini

Create a `.env` file at the repo root:

```bash
GEMINI_API_KEY=your_key_here
# optional
GEMINI_MODEL=gemini-2.5-pro
```

If `GEMINI_API_KEY` is not set, Gemini calls will fail.

## 3) Run grading with the CLI (Gemini rubric grading)

### Grade a benchmark directory

```bash
python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/final_prompt_v3.json \
  --run_name final_prompt_v3 \
  --prompt_name prompt_v3
```

Useful flags:
- `--question_ids q7 q8` (only grade certain questions/subparts)
- `--limit_students 5`, `--limit_questions 2` (debug limits)
- `--model_name gemini-2.5-pro` (override model)
- `--manifest_path .../benchmark_manifest.json` (portable benchmark descriptor)
- `--max_concurrency 5` (async worker pool; up to 5 in-flight Gemini calls)
- `--max_retries 5 --retry_base_delay 1.0` (retry/backoff on transient failures)

### Evaluate the run against professor scores

```bash
python -m src.grading_tool.cli.evaluate \
  --run_path data/outputs/runs/final_prompt_v3.json \
  --professor_grade_path data/benchmarks/cs302_final_fall2025/final_professor_grade.json \
  --output_path data/outputs/reports/final_prompt_v3_eval.json
```

If you omit `--output_path`, the CLI writes to:
- `data/outputs/reports/<run_stem>_eval_<YYYYMMDD_HHMMSS>.json`

By default, evaluation will **not** overwrite an existing report file. To overwrite, pass `--overwrite`.

## 4) Run the API (FastAPI)

```bash
uvicorn app.main:app --reload --port 8000
```

Health check:
- `GET http://localhost:8000/api/health`

Grading endpoints:
- `POST /api/grade` — rule-based placeholder, retained for legacy single-answer demos.
- `POST /api/grade-batch` — uses the Gemini `RubricGrader` when each submission carries `rubric` + `question_text`; otherwise falls back to the placeholder.
- `POST /api/evaluation/calibrate` — runs the full multi-round rubric calibration loop through `RubricGrader`.

The Gemini-backed endpoints accept the API key as a request header (`X-API-Key: <key>` or `Authorization: Bearer <key>`) so the server does not need a process-level `GEMINI_API_KEY`. The frontend Evaluation page forwards the key from its Settings panel.

## 4b) Terminal-only calibration (no server, no frontend)

For quick local experiments you can call the calibration loop directly:

```bash
GEMINI_API_KEY=your_key \
python scripts/run_calibration.py \
  --benchmark data/benchmarks/cs302_midterm1_fall2025 \
  --question_id q3 \
  --max_rounds 5
```

Helpful flags: `--limit N` (cap submissions for a smoke run), `--no_semantic`, `--target_mse`, `--min_improvement`, `--output`. Results are written to `data/outputs/reports/`.

## 5) Run the frontend

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend calls `http://localhost:8000`. Override via:

```bash
export VITE_API_BASE_URL=http://localhost:8000
```

## Troubleshooting

### “GEMINI_API_KEY is not set.”
- Ensure `.env` exists at repo root and contains `GEMINI_API_KEY=...`
- Ensure you are running from the repo root so dotenv can load it

### API won’t start (missing `fastapi` or `uvicorn`)
- Install: `pip install fastapi uvicorn`

### Semantic metrics errors (BERTScore / sentence-transformers)
- Either set `include_semantic_metrics=False` in your evaluation path, or install:
  - `pip install sentence-transformers bert-score torch`
  