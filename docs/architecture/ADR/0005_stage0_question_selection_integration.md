# ADR 0005: Stage 0 Question Selection Intelligence Integration

## Context

In Phase 5 and Phase 5.2, Question Selection Intelligence was built and sequentially calibrated as an isolated module to solve topic lock-in (e.g. Polity short-answer questions repeatedly selecting Panchayati Raj). The selector passed all behavioral diagnostics and was declared **READY WITH CONDITIONS**.

In Phase 5.2.1, the selector required production-readiness hardening, regression test protection, product exposure control for `BPSC-SUB-10` (General & Miscellaneous), and full integration with Stage 0 question generation (`src/stage0.ts`).

## Decision

1. **Preserve Selection Scoring Model 100%**: Retain all established scoring weights, formulas, log-normalization, student exposure decay (`1.00 → 0.70 → 0.40 → 0.10`), repetition penalties (`0.00 → 0.15 → 0.30 → 0.50`), and 100% deterministic tie-breakers.
2. **Hardening & BPSC-SUB-10 Exposure Control**:
   - `BPSC-SUB-10` (General & Miscellaneous) remains in `SUBJECT_MAP` and relational database tables for historical integrity, but is marked `selectable: false`.
   - Direct requests for `BPSC-SUB-10` via API or bot return a clean user message: *"This subject is currently unavailable for practice. Please choose one of the available subjects."*
3. **Stage 0 Integration Pipeline**:
   - `generateQuestion()` calls `selectTargetTopic()` to resolve the optimal target subject, topic, slot type, and suggested retrieval query.
   - The selected `target_topic_name` and `suggested_retrieval_query` constrain RAG vector retrieval in `ncertFor`.
   - The generated question and `EvaluationBlueprint` are strictly bound to `target_topic_name`, preventing topic drift.
4. **Structured Logging & Traceability**:
   - Log selection metadata (`subject_id`, `topic_id`, `question_type`, `marks`, `selection_score`, `selection_reason`, `suggested_retrieval_query`) for every Stage 0 run.

## Consequences

- Zero topic drift and zero question-type drift across all 9 active subjects.
- Student practice requests dynamically adapt without locks or repetitive patterns.
- `BPSC-SUB-10` is safely isolated from student-facing practice until a production topic taxonomy is defined.
- Standardized baseline tests increased from 55 to 62 PASS (100% success rate).

## Date

2026-09-09
