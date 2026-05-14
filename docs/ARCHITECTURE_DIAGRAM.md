# Architecture Diagrams (Mermaid)

Two views: (1) high-level pipeline, (2) calibration loop detail.
Paste into Notion, Google Slides (via Mermaid Live), GitHub README, or any Mermaid renderer.

---

## 1. High-Level Pipeline

```mermaid
flowchart TB
    subgraph IN["📥 Input Layer"]
        Q[question.json]
        R[rubric.json]
        S[solution.json]
        A[student_answers.json]
        P[professor_grade.json]
    end

    subgraph GRADE["🤖 Grading Pipeline"]
        ORCH[Orchestrator]
        ROUTER[QuestionTypeRouter<br/><i>route by benchmark_type</i>]
        PB[PromptBuilder<br/><i>v1 strict | v2 balanced | v3 professor-aligned</i>]
        RG[RubricGrader]
        GC[GeminiClient<br/><i>temp=0, top_k=1, JSON mode</i>]
        GEM[(Gemini 2.5 Pro)]
    end

    OUT["📤 run.json<br/>per (student × question):<br/>score, criterion_results, feedback, confidence"]

    subgraph EVAL["📊 Evaluation"]
        M[metrics.py<br/>MAE · MSE · Pearson · Spearman · ExactMatch]
        REPORT["eval report JSON"]
    end

    subgraph CALIB["🔁 Calibration Loop"]
        LOOP[run_calibration<br/>round 1..N]
        FOCUS[_build_revision_focus<br/><i>bucketed disagreements + answer excerpts</i>]
        REV[RubricGenerator.revise<br/><i>solution-anchored rubric</i>]
        BEST[best_rubric<br/><i>lowest MSE round wins</i>]
    end

    subgraph UI["🖥️ Frontend"]
        QI[QuestionIntakePage]
        SG[SubmissionGradingPage]
        EV[EvaluationPage]
    end

    Q --> ORCH
    R --> ORCH
    S --> ORCH
    A --> ORCH
    ORCH --> ROUTER --> PB --> RG --> GC --> GEM
    GEM --> OUT
    OUT --> EVAL
    OUT --> CALIB
    P --> EVAL
    P --> CALIB
    M --> REPORT
    LOOP --> FOCUS --> REV --> LOOP
    LOOP --> BEST
    UI -.HTTP.-> ORCH

    style GEM fill:#4285F4,color:#fff
    style BEST fill:#34A853,color:#fff
    style REPORT fill:#34A853,color:#fff
```

---

## 2. Calibration Loop Detail

```mermaid
flowchart TB
    START([Start: original_rubric, submissions, professor_grades])
    GRADE["1. Grade all submissions<br/><i>N Gemini calls @ prompt_v3</i>"]
    EVAL["2. Evaluate vs professor<br/><i>MSE, MAE, flagged cases</i>"]
    BEST{"current_mse<br/>< best_mse?"}
    UPDATE[Update best_rubric]
    FOCUS["3. Build revision focus<br/><i>over/under-credit counts<br/>buckets: direction × length × score band<br/>3 concrete examples with student answers</i>"]
    REVISE["4. LLM revise rubric<br/><i>1 Gemini call, solution-anchored</i>"]
    STOP{"Stop?<br/>• target MSE reached<br/>• improvement < min_improvement<br/>• no flagged cases<br/>• max_rounds hit"}
    NEXT[current_rubric ← revised_rubric]
    END([Return best_rubric])

    START --> GRADE
    GRADE --> EVAL
    EVAL --> BEST
    BEST -- yes --> UPDATE --> FOCUS
    BEST -- no --> FOCUS
    FOCUS --> REVISE
    REVISE --> STOP
    STOP -- yes --> END
    STOP -- no --> NEXT
    NEXT --> GRADE

    style GRADE fill:#4285F4,color:#fff
    style REVISE fill:#FBBC04,color:#000
    style END fill:#34A853,color:#fff
```

---

## 3. Data Schema Flow

```mermaid
flowchart LR
    subgraph BENCH["Benchmark Files"]
        BR["rubric.json<br/><i>criteria, points, descriptions</i>"]
        BA["student_answers.json<br/><i>per student → list of answers</i>"]
        BP["professor_grade.json<br/><i>per student → list of grades</i>"]
    end

    subgraph GREQ["GradeRequest"]
        GR["student_id<br/>question_id<br/>answer<br/>rubric<br/>question_text<br/>reference_solution"]
    end

    subgraph GRES["GradeResult"]
        GS["student_id, question_id<br/>score, max_score<br/>criterion_results[]<br/>feedback, confidence"]
    end

    subgraph EREP["Evaluation Report"]
        ER["MAE, MSE<br/>exact_match_rate<br/>Pearson, Spearman<br/>flagged_cases[]"]
    end

    BR --> GR
    BA --> GR
    GR --> GS
    GS --> ER
    BP --> ER
```

---

## Quick render

- **VS Code**: install the "Markdown Preview Mermaid Support" extension, open this file, ⌘+K V.
- **Online**: paste any block into [mermaid.live](https://mermaid.live).
- **GitHub**: renders inline automatically when committed.
- **Slides export**: mermaid.live → "Actions" → Export PNG/SVG.
