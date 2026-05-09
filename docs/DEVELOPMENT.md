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
### Install dependencies
If missing:
```bash
pip install fastapi uvicorn
```

### Run dev server
```bash
uvicorn app.main:app --reload --port 8000
```

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
- The API uses a rule-based placeholder grader; the Gemini rubric grader is in the CLI/core pipeline.
- Semantic metrics require extra dependencies (see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)).
