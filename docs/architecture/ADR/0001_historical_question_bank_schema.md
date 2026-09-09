# ADR 0001: Historical BPSC Question Bank Relational Database Schema & Ingestion

## Status
APPROVED

## Date
2026-09-09

## Context
In Phase 4A of the BPSC AI Mentor project, 626 historical BPSC Mains questions extracted in Phase 1 and classified in Phases 2 and 3 needed to be migrated into the Supabase PostgreSQL database.

Key requirements for this migration:
1. **Preservation of Existing System**: Zero breaking changes to existing tables (`users`, `attempts`, `submissions`, `evaluations`, `document_chunks`), existing bot flows, or OCR evaluation pipelines.
2. **Normalized Taxonomy**: Represent Subjects (`bpsc_subjects`), Topics (`bpsc_topics`), and Historical Questions (`bpsc_questions`) with foreign keys for fast relational querying.
3. **Data Quality Audit**: Exclude structural headers/section labels (23 records) from the production table into `bpsc_questions_excluded.csv`, preserving full traceability.
4. **Idempotency**: Prevent duplicate insertions when running imports multiple times using `ON CONFLICT (question_id) DO UPDATE`.
5. **No Vector Embeddings in Phase 4A**: Vector embeddings for question retrieval/RAG are deferred to future knowledge ingestion phases; historical questions remain strictly relational for Phase 4A.

## Decision
We implemented an additive SQL migration `db/migrations/0007_bpsc_question_bank.sql` that creates:
- `bpsc_subjects`: Subject taxonomy with 10 standard BPSC subjects (`BPSC-SUB-01` to `BPSC-SUB-10`).
- `bpsc_topics`: Data-driven topic taxonomy (32 topics derived from historical BPSC question distributions).
- `bpsc_questions`: Relational historical question bank storing 603 audited production questions.

An idempotent import runner script `src/scripts/import-bpsc-question-bank.ts` imports the dataset from `data/bpsc_question_bank/production/bpsc_questions_production.json`.

## Consequences
- **Relational Efficiency**: Questions can now be filtered by subject, topic, year, marks, question type, and text search without vector search overhead.
- **Traceability**: All 603 questions retain source PDF name, page number, original question text, year, paper, section, and question number.
- **Data Safety**: Staging Phase 3 artifacts remain untouched; clean production files are stored in `data/bpsc_question_bank/production/`.
- **Zero Regression**: All existing bot, Stage 0, Stage A, Stage B, and unit tests continue to pass 100%.
