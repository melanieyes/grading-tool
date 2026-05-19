```
grading-tool/
├── .env
├── .gitignore
├── README.md
├── FOLDER_STRUCTURE.md
├── pyproject.toml
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── routes/
│   │   ├── evaluation.py
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
│   │   │   ├── final_professor_grade.json
│   │   │   ├── final_question.json
│   │   │   ├── final_rubric.json
│   │   │   ├── final_solution.json
│   │   │   └── final_student_answers.json
│   │   ├── cs302_midterm1_fall2025/
│   │   │   ├── midterm1_answers.json
│   │   │   ├── midterm1_professor_grade.json
│   │   │   ├── midterm1_question.json
│   │   │   ├── midterm1_rubric.json
│   │   │   └── midterm1_solution.json
│   │   ├── cs302_midterm2_fall2025/
│   │   │   ├── midterm2_professor_grade.json
│   │   │   ├── midterm2_question.json
│   │   │   ├── midterm2_rubric.json
│   │   │   ├── midterm2_solution.json
│   │   │   └── midterm2_student_answers.json
│   │   └── synthesis/
│   │       ├── synthesis_professor_grade.json
│   │       ├── synthesis_question.json
│   │       ├── synthesis_rubric.json
│   │       ├── synthesis_solution.json
│   │       └── synthesis_student_answers.json
│   ├── econ/
│   │   ├── econ-answer.json
│   │   ├── econ-grade.json
│   │   └── econ-question.json
│   ├── final.md
│   ├── final_solution_design.md
│   ├── midterm1.md
│   ├── midterm2.md
│   └── rubric_design.md
├── docs/
│   ├── API.md
│   ├── ARCHITECTURE_DIAGRAM.md
│   ├── DATA_FORMATS.md
│   ├── DEVELOPMENT.MD
│   ├── GETTING_STARTED.MD
│   ├── HomePage.png
│   ├── REPO_NOTES.md
│   └── CALIBRATION.md
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
│   │   ├── components/
│   │   │   └── TopNav.tsx
│   │   ├── demo/
│   │   │   ├── final-q7-slice.ts
│   │   │   ├── index.ts
│   │   │   ├── midterm1-q3-slice.ts
│   │   │   └── midterm1-slice.ts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── demoData.ts
│   │   │   └── gradingUtils.ts
│   │   └── pages/
│   │       ├── EvaluationPage.tsx
│   │       ├── HomePage.tsx
│   │       ├── QuestionIntakePage.tsx
│   │       └── SubmissionGradingPage.tsx
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── scripts/
│   ├── run_calibration.py
│   └── data/
│       └── outputs/
│           └── calibration/
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
│       │   ├── calibration.py
│       │   ├── error_analysis.py
│       │   ├── evaluation.md
│       │   ├── metrics.py
│       │   └── reports.py
│       ├── grading/
│       │   ├── __init__.py
│       │   ├── mistake_analyzer.py
│       │   ├── orchestrator.py
│       │   ├── prompt_builder.py
│       │   ├── prompt_strategy.md
│       │   ├── question_type_router.py
│       │   ├── response_parser.py
│       │   ├── rubric_generator.py
│       │   ├── rubric_grader.py
│       │   ├── rubric_reviser.py
│       │   └── survey_reviewer.py
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
    ├── synthesis_prompt_v1_eval_v2.json
    ├── synthesis_prompt_v1_run.json
    ├── synthesis_prompt_v2_eval_v2.json
    ├── synthesis_prompt_v2_run.json
    ├── synthesis_prompt_v3_full.json
    ├── synthesis_prompt_v3_full_eval_v2.json
    ├── test_aggregation.py
    ├── test_evaluation_metrics.py
    ├── test_loader.py
    └── test_rubric_grader_schema.py
```
