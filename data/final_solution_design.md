## 1. Solution Design

### 1.1 Purpose of the solution file

The ground truth solution (`solutions_final.json`) serves as the reference answer the LLM grader receives alongside the rubric when evaluating a student answer. It is intentionally more comprehensive than a minimal correct answer — it explicitly names every reasoning step so the LLM has a clear anchor for each rubric criterion.

### 1.2 Structural decisions

Each solution is structured to mirror the rubric criteria in order:

- Q2 sub-parts: solution walks through (i) what each class means, (ii) why the claim fails, (iii) the P≠NP conditional, and (iv) the conclusion — matching criteria q2x_1 through q2x_4 in sequence.
- Q3 and Q4: solution explicitly labels Certificate, Verifier, Polynomial time, and Completeness/Soundness sections.
- Q7: solution explicitly labels Construction, Forward direction, Backward direction, Polynomial time, and Conclusion.
- Q8: solution uses `--- Part 1 ---` / `--- Part 2 ---` headers to separate NP membership from NP-hardness, and within Part 2 explicitly labels Construction, Forward direction, Backward direction, Polynomial time, and Conclusion.

### 1.3 Coverage of non-standard correct arguments

The solution for q2h explicitly mentions Ladner's theorem as an alternative valid reasoning path, so the LLM grader knows to award full credit for a student who invokes NP-intermediate problems correctly — even though this is not the minimal expected answer.

---

## 2. Benchmark Type Classification

Each question is tagged with a `benchmark_type` field used as the primary grouping key for error analysis:

| benchmark_type | Questions | Purpose |
|---|---|---|
| `true_false_with_explanation` | q2b, q2c, q2e, q2f, q2g, q2h | Tests misconception detection and separation of T/F from reasoning quality |
| `np_membership_proof` | q3, q4 | Tests verifier construction and decision-problem framing |
| `polynomial_reduction` | q7 | Tests two-direction reduction proofs |
| `np_completeness_proof` | q8 | Tests combined NP membership + NP-hardness argument |

This classification enables the central research question of the benchmark: does LLM grading accuracy differ systematically by proof type?


