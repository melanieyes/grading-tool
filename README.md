# Grading Tool

<p align="center">
  <img src="docs/HomePage.png" alt="Description of the image" width="600">
</p>

Hybrid deterministic + Gemini rubric grading tool with:
- A Python CLI for running benchmark grading and evaluation.
- A FastAPI backend (used by the frontend).
- A React (Vite) frontend for a simple grading workflow UI.

See also:
- [`docs/REPO_DETAILS.md`](docs/REPO_DETAILS.md) (repo notes: overview + deep dive)
- [`docs/REPO_NOTES.md`](docs/REPO_NOTES.md) (redirect)

More docs:
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
- [`docs/DATA_FORMATS.md`](docs/DATA_FORMATS.md)
- [`docs/API.md`](docs/API.md)
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

## Quickstart

### 1) Python setup

Create a virtual environment and install the package:

```bash
python -m venv .venv
source .venv/bin/activate

pip install -e .
```

If you plan to run the API server, install its dependencies (not currently listed in `pyproject.toml`):

```bash
pip install fastapi uvicorn
```

Optional (only needed if you enable semantic metrics in evaluation):

```bash
pip install sentence-transformers bert-score torch
```

### 2) Configure Gemini

The Gemini-based grading pipeline requires a Gemini API key.

Create `.env` at the repo root:

```bash
GEMINI_API_KEY=your_key_here
# optional
GEMINI_MODEL=gemini-2.5-pro
```

Notes:
- The client loads `.env` automatically via `python-dotenv`.
- If `GEMINI_MODEL` is omitted, the code defaults to `gemini-2.5-pro`.

### 3) Run CLI grading + evaluation (recommended first)

Run grading on a benchmark directory:

```bash
python -m src.grading_tool.cli.grade \
	--benchmark_dir data/benchmarks/cs302_final_fall2025 \
	--output_path data/outputs/runs/final_prompt_v3.json \
	--run_name final_prompt_v3 \
	--prompt_name prompt_v3
```

Evaluate that run against professor scores:

```bash
python -m src.grading_tool.cli.evaluate \
	--run_path data/outputs/runs/final_prompt_v3.json \
	--professor_grade_path data/benchmarks/cs302_final_fall2025/final_professor_grade.json \
	--output_path data/outputs/reports/final_prompt_v3_eval.json
```

Common grading flags:
- `--question_ids q7 q8`
- `--limit_students 5`
- `--limit_questions 2`
- `--model_name gemini-2.5-pro`
- `--manifest_path data/benchmarks/.../benchmark_manifest.json`

## Running the API (FastAPI)

Start the server:

```bash
uvicorn app.main:app --reload --port 8000
```

Useful endpoints:
- `GET /api/health`
- `POST /api/grade`
- `POST /api/grade-batch`
- `POST /api/evaluation/run`
- `POST /api/evaluation/calibrate`

Important: the API currently uses a **rule-based placeholder** grader (`score_answer()` in `app/services/grader_service.py`) to keep the frontend working. The Gemini rubric grading pipeline is implemented in the CLI/core path (`src/grading_tool/grading/*`).

## Running the frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

By default the frontend calls the backend at `http://localhost:8000`.
You can override with:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## Repo layout

- `src/grading_tool/` — core grading + evaluation library
	- `grading/` — benchmark orchestration, prompt building, parsing, rubric grader
	- `evaluation/` — agreement evaluation, metrics, report helpers
	- `models/` — Gemini client wrapper
	- `schemas/` — Pydantic schemas for benchmark and results
- `app/` — FastAPI backend (routes + schemas + service layer)
- `frontend/` — React UI
- `configs/` — prompt configs (`configs/prompts.yaml`)
- `data/` — benchmarks + outputs (runs and reports)

## Tests

```bash
pytest
```

## Notes / Known gaps

- API grading is currently rule-based; CLI grading is Gemini-based.
- Frontend evaluation page uses sample data (not wired to live reports yet).
- Some backend deps (FastAPI/Uvicorn) may need to be installed separately.

