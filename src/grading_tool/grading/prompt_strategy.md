## Prompt Strategy

Three prompts of increasing complexity will be tested on the same student answers:

- **Prompt 1 (minimal):** Provide the question, the student answer, and the total points. Ask the LLM to assign a score with a brief justification.
- **Prompt 2 (rubric-guided):** Provide the question, the student answer, the rubric criteria with point values, and the total points. Ask the LLM to score each criterion and sum them.
- **Prompt 3 (full context):** Provide the question, the student answer, the rubric criteria, the ground truth solution, and explicit grading notes. Ask the LLM to score each criterion with a justification, referencing both the rubric and the model solution.

The hypothesis is that Prompt 3 will produce the highest agreement with professor grades, especially on `np_completeness_proof` and `polynomial_reduction` questions where multi-step correctness is hardest to assess without a reference answer.

Number of prompt need to be determined later