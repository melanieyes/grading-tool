
# Evaluation Metrics Choice

We use a small set of complementary metrics because no single metric can fully capture grading quality.

## Core Metrics

### 1. MAE (Mean Absolute Error)
MAE measures the average absolute difference between the LLM-assigned score and the professor score.

Why we use it:
- directly reflects score closeness
- easy to interpret
- robust as a primary grading metric

A lower MAE means the grading tool is numerically closer to the professor.

### 2. Exact Match Rate
Exact match measures how often the LLM gives exactly the same score as the professor.

Why we use it:
- gives a strict agreement signal
- useful for discrete rubric-based grading
- easy to explain in reports

A higher exact match rate means the tool reproduces professor scores more precisely.

### 3. Pearson Correlation
Pearson correlation measures linear alignment between LLM scores and professor scores.

Why we use it:
- checks whether the model follows the same score trend
- useful when exact scores differ slightly but overall scaling is similar
- indicates whether stronger answers still receive higher scores

A higher Pearson correlation means the model’s score pattern aligns better with the professor’s score pattern.

### 4. Spearman Correlation
Spearman correlation measures rank-order agreement between LLM scores and professor scores.

Why we use it:
- checks whether the model preserves relative ordering of students
- useful even when exact score calibration is imperfect
- helps detect whether the grader distinguishes stronger vs weaker answers correctly

A higher Spearman correlation means the model ranks answers more similarly to the professor.

## Optional Semantic Metrics

### 5. BERTScore / Cosine Similarity
These metrics compare the semantic similarity between generated feedback and reference feedback, or between textual grading outputs when applicable.

Why we use them:
- capture meaning similarity beyond exact wording
- useful for evaluating feedback quality
- complementary to score-based metrics

These are secondary metrics and should not replace score-alignment metrics.

## Why We Use Multiple Metrics
Each metric captures a different property:

- **MAE**: numeric score closeness
- **Exact Match**: strict score agreement
- **Pearson**: score trend alignment
- **Spearman**: rank consistency

Together, they give a more complete picture of grading performance.

## Practical Interpretation
A strong grading setup should ideally have:
- low **MAE**
- high **Exact Match**
- high **Pearson correlation**
- high **Spearman correlation**

If correlation is high but exact match is low, the model may understand answer quality but still be poorly calibrated.
If MAE is low but correlation is weak, the model may be close on average but inconsistent in ranking answer quality.