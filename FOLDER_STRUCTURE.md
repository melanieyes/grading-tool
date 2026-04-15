```
grading-tool/
├── .env
├── .gitignore
├── README.md
├── FOLDER_STRUCTURE.md
├── pyproject.toml
├── app/
│   ├── main.py
│   ├── routes/
│   │   ├── grading.py
│   │   ├── health.py
│   │   └── runs.py
│   ├── schemas/
│   │   └── api_models.py
│   └── services/
│       └── grader_service.py
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
├── frontend/
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── public/
│   ├── src/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── mockData.ts
│   │   ├── types.ts
│   │   ├── assets/
│   │   ├── components/
│   │   │   └── TopNav.tsx
│   │   ├── lib/
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       ├── QuestionIntakePage.tsx
│   │       ├── RubricReviewPage.tsx
│   │       └── SubmissionGradingPage.tsx
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── logs/
│   ├── app.log
│   ├── grading_runs.jsonl
│   ├── llm_requests.jsonl
│   └── llm_responses.jsonl
├── src/
│   └── grading_tool/
│       ├── cli/
│       │   ├── evaluate.py
│       │   └── grade.py
│       ├── evaluation/
│       │   ├── __init__.py
│       │   ├── agreement.py
│       │   ├── error_analysis.py
│       │   ├── evaluation.md
│       │   ├── metrics.py
│       │   └── reports.py
│       ├── grading/
│       │   ├── __init__.py
│       │   ├── orchestrator.py
│       │   ├── prompt_builder.py
│       │   ├── prompt_strategy.md
│       │   ├── question_type_router.py
│       │   ├── response_parser.py
│       │   └── rubric_grader.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── gemini_client.py
│       ├── schemas/
│       │   ├── __init__.py
│       │   ├── benchmark.py
│       │   ├── evaluation.py
│       │   └── grading.py
│       ├── utils/
│       │   ├── io.py
│       │   └── text.py
│       └── __init__.py
└── tests/
    ├── test_aggregation.py
    ├── test_evaluation_metrics.py
    ├── test_loader.py
    └── test_rubric_grader_schema.py
```
