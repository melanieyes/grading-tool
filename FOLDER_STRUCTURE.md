```
grading-tool/
├── .env
├── .gitignore
├── FOLDER_STRUCTURE.md
├── README.md
├── pyproject.toml
├── app/
│   ├── __init__.py
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
│   │   ├── cs302_final_fall2025/
│   │   │   ├── final_rubric.json
│   │   │   ├── final_student_answers.json
│   │   │   ├── professor_grade_final.json
│   │   │   ├── question_final.json
│   │   │   └── solutions_final.json
│   │   └── cs302_midterm1_fall2025/
│   │       ├── answers_midterm1.json
│   │       ├── professor_grade_midterm1.json
│   │       ├── question_midterm1.json
│   │       ├── rubric_midterm1.json
│   │       └── solution_midterm1.json
│   ├── interim/
│   ├── outputs/
│   │   ├── reports/
│   │   │   └── student001_prompt_v3_v2_eval.json
│   │   └── runs/
│   │       ├── first3_prompt_v3_fixed.json
│   │       └── student001_prompt_v3_v2.json
│   ├── final.md
│   ├── final_solution_design.md
│   ├── midterm1.md
│   ├── midterm2.md
│   └── rubric_design.md
├── frontend/
│   ├── .gitignore
│   ├── README.md
│   ├── eslint.config.js
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   ├── mockData.ts
│   │   ├── types.ts
│   │   ├── assets/
│   │   │   ├── react.svg
│   │   │   └── vite.svg
│   │   ├── components/
│   │   │   └── TopNav.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── demoData.ts
│   │   │   └── gradingUtils.ts
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       ├── QuestionIntakePage.tsx
│   │       ├── RubricReviewPage.tsx
│   │       └── SubmissionGradingPage.tsx
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── src/
│   ├── __init__.py
│   └── grading_tool/
│       ├── __init__.py
│       ├── cli/
│       │   ├── evaluate.py
│       │   └── grade.py
│       ├── evaluation/
│       │   ├── __init__.py
│       │   ├── agreement.py
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
│       └── utils/
│           ├── io.py
│           └── text.py
└── tests/
    ├── test_aggregation.py
    ├── test_evaluation_metrics.py
    ├── test_loader.py
    └── test_rubric_grader_schema.py
```
