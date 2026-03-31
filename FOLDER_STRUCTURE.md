# Project Folder Structure

```text
grading-tool/
├── pyproject.toml
├── README.md
├── app/
│   ├── streamlit_app.py
│   ├── components/
│   │   ├── charts.py
│   │   ├── feedback_cards.py
│   │   ├── sidebar.py
│   │   └── tables.py
│   └── pages/
│       ├── 1_Load_Data.py
│       ├── 2_Single_Grading.py
│       ├── 3_Batch_Grading.py
│       └── 4_Debug_and_Evals.py
├── configs/
│   ├── base.yaml
│   ├── prompts.yaml
│   └── scoring.yaml
├── data/
│   ├── final_solution_design.md
│   ├── final.md
│   ├── midterm1.md
│   ├── midterm2.md
│   ├── rubric_design.md
│   ├── outputs/
│   │   ├── graded_q9_results.json
│   │   └── graded_q9_summary.csv
│   └── raw/
│       ├── final_rubric.json
│       ├── final_student_answers.json
│       ├── professor_grade.json
│       ├── question_final.json
│       └── solutions_final.json
├── logs/
│   ├── grading_runs.jsonl
│   ├── llm_requests.jsonl
│   └── llm_responses.jsonl
├── src/
│   ├── __init__.py
│   ├── config.py
│   ├── io_utils.py
│   ├── pipeline.py
│   ├── run_batch.py
│   ├── __pycache__/
│   ├── evals/
│   │   ├── __init__.py
│   │   ├── benchmark.py
│   │   ├── error_analysis.py
│   │   └── evaluation.md
│   ├── grading/
│   │   ├── __init__.py
│   │   ├── answer_loader.py
│   │   ├── deterministic_checker.py
│   │   ├── feedback_builder.py
│   │   ├── language_specs.py
│   │   ├── llm_fallback_grader.py
│   │   ├── prompt_strategy.md
│   │   ├── question_loader.py
│   │   ├── regex_normalizer.py
│   │   ├── regex_parser.py
│   │   ├── score_combiner.py
│   │   └── __pycache__/
│   ├── grading_tool.egg-info/
│   │   ├── dependency_links.txt
│   │   ├── PKG-INFO
│   │   ├── requires.txt
│   │   ├── SOURCES.txt
│   │   └── top_level.txt
│   ├── models/
│   │   ├── __init__.py
│   │   ├── gemini_client.py
│   │   └── __pycache__/
│   └── schemas/
│       ├── __init__.py
│       ├── input_models.py
│       ├── llm_models.py
│       └── output_models.py
└── tests/
    ├── test_checker.py
    ├── test_gemini_schema.py
    ├── test_normalizer.py
    └── test_pipeline.py
```