# Development

This doc covers local development workflows for the Python core, API, and frontend.

## Python
### Install
```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

### Run tests
```bash
pytest
```

### Run CLI tools
- Grade benchmark:
  ```bash
  python -m src.grading_tool.cli.grade --benchmark_dir data/benchmarks/cs302_final_fall2025
  ```
- Evaluate run:
  ```bash
  python -m src.grading_tool.cli.evaluate --run_path data/outputs/runs/baseline_run.json
  ```

### Environment variables
- `GEMINI_API_KEY` (required for Gemini-based grading)
- `GEMINI_MODEL` (optional)

These can be placed in `.env` at repo root.

## API (FastAPI)
`fastapi` and `uvicorn[standard]` are declared in [pyproject.toml](pyproject.toml), so `pip install -e .` already installs them. Reinstall with `pip install fastapi uvicorn` only if your environment is broken.

### Run dev server
```bash
uvicorn app.main:app --reload --port 8000
```

### Calibration from the terminal (no server)
For ad-hoc calibration without standing up the API/frontend:
```bash
GEMINI_API_KEY=... python scripts/run_calibration.py \
  --benchmark data/benchmarks/cs302_midterm1_fall2025 \
  --question_id q3 \
  --max_rounds 5
```
See [scripts/run_calibration.py](scripts/run_calibration.py) for the full flag list.

## Frontend (Vite + React)
### Install
```bash
cd frontend
npm install
```

### Run dev server
```bash
npm run dev
```

### Configure API base
```bash
export VITE_API_BASE_URL=http://localhost:8000
```

## Working with benchmarks
- Benchmark data lives under [data/benchmarks](data/benchmarks).
- Outputs:
  - runs: [data/outputs/runs](data/outputs/runs)
  - reports: [data/outputs/reports](data/outputs/reports)

## Common gotchas
- `POST /api/grade` is still the rule-based placeholder. Use `POST /api/grade-batch` (with `rubric` + `question_text` on each submission) or `POST /api/evaluation/calibrate` for real Gemini grading.
- Gemini-backed endpoints expect the API key via the `X-API-Key` (or `Authorization: Bearer ...`) request header, not just the server env. The frontend forwards the key from its Settings panel.
- Semantic metrics still return `None` from the API evaluation path. The CLI evaluator computes them when extra packages are installed (see [docs/GETTING_STARTED.MD](docs/GETTING_STARTED.MD)).

