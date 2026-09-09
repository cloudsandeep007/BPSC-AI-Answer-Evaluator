# ADR 0006: End-to-End Student Journey Architecture & Workflow Readiness

## Status

APPROVED (Phase 6 Completed)

## Date

2026-09-09

## Context

Following the implementation and hardening of Stage 0 Question Selection Intelligence in Phase 5.2.1, Phase 6 performed a comprehensive end-to-end validation of the complete student practice lifecycle.

The objective was to verify that all decoupled subsystems — Telegram conversation bot, Question Selection Intelligence, RAG vector retrieval, Stage 0 question generation & blueprinting, Stage A OCR handwriting transcription, transcript confirmation/editing, Stage B judging, deterministic score calculation, PDF report card generation, and practice history updates — operate seamlessly as ONE coherent, production-ready product.

## Decision

1. **Preserve Subsystem Decoupling & Boundaries**:
   - **Stage 0**: Decides question, Evaluation Blueprint, and NCERT citations *once per question*.
   - **Stage A**: Converts handwritten answer sheets to transcript text in memory, storing image SHA-256 hash.
   - **Transcript Gate**: Enables student confirmation or editing prior to grading. Stage B consumes the *confirmed/edited* transcript.
   - **Stage B & Calibration**: Stage B judges transcript against the stored Evaluation Blueprint, outputting band labels per dimension. `computeScore()` in `src/content/calibration.ts` deterministically computes final marks, applying realism ceilings and caps in code arithmetic.
   - **Report Card**: PDFKit renders Noto Sans Devanagari PDF report cards with score-trend sparklines.
   - **Practice History & Selection Loop**: Completed submissions update `historyService.ts`, dynamically feeding anti-repetition penalties into the next question selection request.
2. **Strict Identity & Isolation**:
   - Active question bookkeeping in `getUserActiveQuestion` isolates User A session state from User B.
   - Student practice history is strictly isolated per `student_id`.
3. **Product Exposure Control**:
   - `BPSC-SUB-10` (General & Miscellaneous) remains in DB tables for historical integrity, but is marked `selectable: false` and hidden from student practice menus.

## Consequences

- **Coherent Student Mentor Loop**: Proven end-to-end student journey with 0 topic drift, 0 question-type drift, 0 cross-user data corruption, and 100% score reproducibility.
- **Auditable Score Arithmetic**: `npm run verify:calibration` passes 100% against official worked examples.
- **High Test Coverage**: Baseline test suite expanded from 62 to **69 PASS** across 11 test suites.
- **Pilot Readiness**: Declared **`READY FOR INTERNAL PILOT`**.
