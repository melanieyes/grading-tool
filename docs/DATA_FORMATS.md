# Data Formats

This repo uses JSON benchmark files for grading runs and evaluation.

Related schemas:
- Benchmark schemas: [src/grading_tool/schemas/benchmark.py](src/grading_tool/schemas/benchmark.py)
- Grading result schema: [src/grading_tool/schemas/grading.py](src/grading_tool/schemas/grading.py)

## Benchmark directory contents
A typical benchmark directory under [data/benchmarks](data/benchmarks) includes:
- Question file (e.g. `*question*.json`)
- Rubric file (e.g. `*rubric*.json`)
- Solutions file (e.g. `*solution*.json`)
- Student answers file(s) (e.g. `*answers*.json`)
- Professor grades file (e.g. `*professor_grade*.json`) (optional but required for evaluation)
- Optional manifest file: `benchmark_manifest.json`

The CLI can auto-discover these if you don’t pass explicit paths.

## Question file
Example: [data/benchmarks/cs302_final_fall2025/final_question.json](data/benchmarks/cs302_final_fall2025/final_question.json)

Top-level questions may contain subparts.

```json
{
  "course": "CS302",
  "term": "Fall 2025",
  "exam": "Final exam",
  "questions": [
    {
      "question_id": "q2",
      "points": 48,
      "benchmark_type": "true_false_with_explanation",
      "question_text": "...",
      "subparts": [
        { "part_id": "q2b", "question_text": "..." }
      ]
    }
  ]
}
```

## Rubric file
Example: [data/benchmarks/cs302_final_fall2025/final_rubric.json](data/benchmarks/cs302_final_fall2025/final_rubric.json)

Rubrics may be per-question or per-subpart. Each criterion has an ID and point value.

```json
{
  "rubric_version": "1.0",
  "questions": [
    {
      "question_id": "q2",
      "total_points": 48,
      "grading_note": "...",
      "subparts": [
        {
          "part_id": "q2b",
          "total_points": 8,
          "criteria": [
            { "criterion_id": "q2b_1", "points": 1, "description": "..." }
          ]
        }
      ]
    }
  ]
}
```

## Solutions file
Example: [data/benchmarks/cs302_final_fall2025/final_solution.json](data/benchmarks/cs302_final_fall2025/final_solution.json)

```json
{
  "questions": [
    {
      "question_id": "q3",
      "benchmark_type": "np_membership_proof",
      "total_points": 16,
      "solution": "..."
    }
  ]
}
```

## Student answers file
Example: [data/benchmarks/cs302_final_fall2025/final_student_answers.json](data/benchmarks/cs302_final_fall2025/final_student_answers.json)

```json
[
  {
    "student_id": "001",
    "answers": [
      { "question_id": "q2b", "student_answer": "..." }
    ]
  }
]
```

## Professor grades file
Example: [data/benchmarks/cs302_final_fall2025/final_professor_grade.json](data/benchmarks/cs302_final_fall2025/final_professor_grade.json)

```json
[
  {
    "student_id": "001",
    "grades": [
      { "question_id": "q2b", "score": 8, "score_max": 8 }
    ]
  }
]
```

## Run payload (grading output)
Example: [data/outputs/runs/cs302_midterm2_prompt_v3.json](data/outputs/runs/cs302_midterm2_prompt_v3.json)

Key fields:
- `run_name`, `prompt_name`, `model_name`, benchmark file paths
- `results`: list of graded question/subpart results

```json
{
  "run_name": "...",
  "prompt_name": "prompt_v3",
  "n_results": 79,
  "results": [
    {
      "student_id": "001",
      "question_id": "q2c_i",
      "benchmark_type": "...",
      "score_awarded": 5.0,
      "score_max": 5.0,
      "criterion_results": [
        {
          "criterion_id": "q2c_i_1",
          "awarded_points": 5.0,
          "max_points": 5.0,
          "justification": "..."
        }
      ],
      "feedback": "...",
      "confidence": 1.0,
      "review_required": false
    }
  ]
}
```

## Evaluation report
Example: [data/outputs/reports/cs302_midterm2_prompt_v3_eval.json](data/outputs/reports/cs302_midterm2_prompt_v3_eval.json)

The CLI evaluation report from [src/grading_tool/evaluation/agreement.py](src/grading_tool/evaluation/agreement.py) includes:
- aggregate metrics (MAE/MSE/exact match/correlations)
- optional semantic metrics
- `per_question` and `per_benchmark_type` breakdowns

```json
{
  "run_name": "...",
  "n_graded": 79,
  "mae": 3.35,
  "mse": 27.41,
  "exact_match_rate": 0.456,
  "pearson_correlation": 0.735,
  "spearman_correlation": 0.657,
  "per_question": [
    { "question_id": "q2c_i", "mae": 1.875, "mse": 9.375, "n": 8 }
  ]
}
```