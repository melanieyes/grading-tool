# grading-tool
python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/debug.json \
  --run_name debug \
  --prompt_name prompt_v1 \
  --limit_students 1 \
  --limit_questions 2
cat data/outputs/runs/debug.json



python -m src.grading_tool.cli.evaluate \
  --run_path data/outputs/runs/debug.json \
  --professor_grade_path data/benchmarks/cs302_final_fall2025/professor_grade.json \
  --output_path data/outputs/reports/debug_eval.json

python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/debug_prompt_v2.json \
  --run_name debug_prompt_v2 \
  --prompt_name prompt_v2 \
  --limit_students 1 \
  --limit_questions 3
python -m src.grading_tool.cli.evaluate \
  --run_path data/outputs/runs/debug_prompt_v2.json \
  --professor_grade_path data/benchmarks/cs302_final_fall2025/professor_grade.json \
  --output_path data/outputs/reports/debug_prompt_v2_eval.json

  python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/debug_prompt_v3.json \
  --run_name debug_prompt_v3 \
  --prompt_name prompt_v3 \
  --limit_students 1 \
  --limit_questions 3


  python -m src.grading_tool.cli.evaluate \
  --run_path data/outputs/runs/debug_prompt_v3.json \
  --professor_grade_path data/benchmarks/cs302_final_fall2025/professor_grade.json \
  --output_path data/outputs/reports/debug_prompt_v3_eval.json

  // now test with the whole question
  python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/student001_prompt_v2.json \
  --run_name student001_prompt_v2 \
  --prompt_name prompt_v2 \
  --limit_students 1

  python -m src.grading_tool.cli.grade \
  --benchmark_dir data/benchmarks/cs302_final_fall2025 \
  --output_path data/outputs/runs/debug_prompt_v3_q7_q8_5students.json \
  --run_name debug_prompt_v3_q7_q8_5students \
  --prompt_name prompt_v3 \
  --limit_students 5 \
  --question_ids q7 q8