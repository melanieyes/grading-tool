## 1. Rubric Design

### 1.1 Design philosophy

The rubric was designed at the level of **atomic reasoning steps**, not holistic impression. Each criterion corresponds to one logical move a student must make to earn those points. This serves two purposes:

- It forces the LLM grader to reason step-by-step rather than make a global judgement
- It enables fine-grained error analysis: we can identify exactly which reasoning step the LLM fails to recognise or penalise correctly

### 1.2 Structure per benchmark type

**True/False + explanation (q2 sub-parts, 8 pts each):**  
Split as 1 pt for the T/F answer and 7 pts for the explanation, distributed across 3–4 reasoning criteria. Critically, the rubric instructs the grader to award explanation points independently of the T/F answer — a student who answers "True" but then writes a fully correct explanation of why the statement is false can still earn most of the explanation points. This is intentional: it tests whether the LLM can separate answer correctness from reasoning quality.

**NP membership proofs (q3, q4, 16 pts each):**  
Three mandatory components — certificate definition, verifier description, polynomial-time argument — plus a conclusion. Q4 adds a fourth component: framing the problem as a decision problem before constructing the verifier. This is the most common error students make on Q4, and a key test of whether the LLM can detect its omission.

**Polynomial reduction (q7, 28 pts):**  
Five criteria: construction, forward direction, backward direction, polynomial-time argument, and conclusion. The forward and backward directions carry equal weight (7 pts each). This is deliberate — many students prove only one direction, and the rubric must force the LLM to check both independently.

**NP-completeness proof (q8, 40 pts):**  
Nine criteria split across two independent blocks: NP membership (8 pts) and NP-hardness via reduction (32 pts). The two blocks are scored independently so a student who correctly proves NP membership but fails the reduction still receives partial credit, and vice versa. The backward direction of the reduction (criterion q8_7) is the hardest criterion and carries 7 pts — it requires the key insight that a matched position cannot have value 2 because w is binary.

### 1.3 Grading notes

Each question in the rubric includes a `grading_note` field that instructs the LLM on edge cases:

- For q2: award explanation points even when T/F is wrong if reasoning is correct
- For q4: deduct 2 pts if the student treats the problem as an optimisation problem without converting to a decision version
- For q7: award partial credit if construction is correct but one direction is missing
- For q8: score NP membership and NP-hardness blocks entirely independently

---