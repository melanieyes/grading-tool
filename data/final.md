# Melanie's Benchmark Design Rationale

**Course:** CS302  
**Term:** Fall 2025  
**Exam:** Final Exam  
**Melanie:** This document covers the Final Exam only (27 student copies, 70% sampled ~ 18 copies).

---

## 1. Overview

The goal of this benchmark is to evaluate how accurately a large language model (LLM) can grade student answers on reasoning-heavy exam questions, using professor-assigned grades as ground truth. The benchmark is designed to support three research outputs:

1. An accuracy measurement of LLM grading across different question types
2. A comparison across three prompt variants of increasing complexity
3. An identification of which question categories the LLM grades well versus poorly

---

## 2. Question Selection

### 2.1 Source exam

The final exam consists of 8 questions (some with sub-parts) totalling 200 points, covering complexity theory: P/NP definitions, true/false reasoning, NP membership proofs, polynomial reductions, and a full NP-completeness proof.

### 2.2 Selection criteria

Questions were filtered along two axes:

**Axis 1 — Reasoning depth.** Only questions requiring multi-step logical reasoning were selected. Pure recall questions (definitions, relationships) were excluded because they produce low answer-length variance and low grading difficulty — the LLM either matches the definition or not, with little nuance to evaluate.

**Axis 2 — Answer variance potential.** Questions where students are expected to produce answers of meaningfully different lengths and structures were prioritised. This is important because the benchmark must test whether the LLM can correctly assign partial credit, not just binary correct/incorrect.

### 2.3 Selected questions

The following 10 questions were selected, spanning 4 structurally distinct proof types:

| Question | Type | Points | Rationale |
|---|---|---|---|
| q2b | True/False + explanation | 8 | Tests misconception about Non-P ∩ NP; high variance in student explanations |
| q2c | True/False + explanation | 8 | Requires chained reasoning: P membership → 3SAT in P → P=NP |
| q2e | True/False + explanation | 8 | Common wrong answer (True); tests understanding of lower bound vs P≠NP |
| q2f | True/False + explanation | 8 | Reduction direction reasoning; symmetric counterpart to q2g |
| q2g | True/False + explanation | 8 | Tests reduction direction confusion — most discriminating T/F sub-part |
| q2h | True/False + explanation | 8 | Tests whether students conflate "outside P and NP-complete" with P≠NP |
| q3 | NP membership proof | 16 | Well-scoped verifier proof; good calibration question |
| q4 | NP membership proof | 16 | Similar to q3 but requires decision-problem framing first |
| q7 | Polynomial reduction | 28 | Two-direction reduction proof; missing backward direction is common error |
| q8 | NP-completeness proof | 40 | Hardest question; requires NP membership + full 3SAT reduction |

### 2.4 Excluded questions

| Question | Reason for exclusion |
|---|---|
| q1 (a–d) | Pure recall — definitions of P, NP, NP-complete, their relationships. Near-zero answer variance. |
| q5 (MAX_SUM ∈ P) | Trivial once insight is reached (take all non-negatives); very low variance after that. Borderline inclusion. |
| q6 (max spanning tree ∈ P) | Answer reduces to "negate weights, run Kruskal." Low structural variance. Borderline inclusion. |

Q5 and Q6 are noted as borderline — they could be added in a later iteration to test LLM handling of concise algorithmic reasoning, but were excluded from the initial benchmark to prioritise questions with higher discriminating power.

### 2.5 Sampling

Per professor guidance, approximately 70% of available student copies are used (18 only). Students were selected to maximise diversity in answer length — short, medium, and long answers should all be represented for each question.










