## TBD Later
## Evaluation Metrics

Agreement between LLM scores and professor scores will be measured using:

- **Exact match rate:** percentage of questions where LLM assigns the exact same score as the professor
- **Mean Absolute Error (MAE):** average absolute difference between LLM score and professor score, per question and aggregated by benchmark_type
- **Within-1 accuracy:** percentage of questions where LLM score is within 1 point of professor score (relevant for partial credit)
- **Per-criterion error rate:** for rubric-guided prompts, the rate at which the LLM incorrectly awards or withholds points on each individual criterion




- **BERT**
- **Cosine**
- **ROUGE**

Results will be reported broken down by (a) benchmark_type, (b) prompt variant, and (c) individual criterion, to produce a fine-grained picture of where LLM grading succeeds and fails.
