grading-tool/
├── .env
├── .gitignore
├── README.md
├── FOLDER_STRUCTURE.md
├── pyproject.toml
├── app/
│   ├── streamlit_app.py
│   ├── components/
│   └── pages/
├── configs/
│   ├── base.yaml
│   ├── prompts.yaml
│   └── scoring.yaml
├── data/
│   ├── benchmarks/
│   │   └── cs302_final_fall2025/
│   │       ├── final_rubric.json
│   │       ├── final_student_answers.json
│   │       ├── professor_grade.json
│   │       ├── question_final.json
│   │       └── solutions_final.json
│   ├── outputs/
│   │   ├── reports/
│   │   └── runs/
│   ├── final.md
│   ├── final_solution_design.md
│   ├── midterm1.md
│   ├── midterm2.md
│   └── rubric_design.md
├── docs/
│   ├── evaluation.md
│   └── prompt_strategy.md
├── logs/
│   ├── app.log
│   ├── grading_runs.jsonl
│   ├── llm_requests.jsonl
│   └── llm_responses.jsonl
├── src/
│   └── grading_tool/
│       ├── __init__.py
│       ├── cli/
│       ├── evaluation/
│       ├── grading/
│       ├── models/
│       ├── schemas/
│       ├── utils/
│       └── config.py
└── tests/
    ├── test_aggregation.py
    ├── test_evaluation_metrics.py
    ├── test_loader.py
    └── test_rubric_grader_schema.py