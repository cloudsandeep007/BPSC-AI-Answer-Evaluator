# ADR 0002: Knowledge Base Ingestion Pipeline & Vector RAG Architecture

## Status
APPROVED

## Date
2026-09-09

## Context
In Phase 4B of the BPSC AI Mentor project, the Knowledge Base ingestion pipeline for BPSC preparation resources (NCERT textbooks, BPSC past papers, syllabus documents, government reports, reference materials) was built to support evidence retrieval for question generation and answer evaluation.

Key requirements:
1. **Preserve Existing Architecture**: Maintain existing `document_chunks` table, `gemini-embedding-001` (3072 dimensions), `embedText()` function, and Supabase PostgreSQL `pgvector` stored procedure `match_document_chunks`.
2. **Idempotency**: Prevent duplicate chunks and unnecessary API calls on repeated ingestion runs using SHA-256 document checksum deduplication.
3. **Traceability**: Retain source file name, relative path, document type, language, page number (`page_number`/`page_start`/`page_end`), subject ID, subject name, topic ID, and topic name in `metadata JSONB`.
4. **Enhanced Vector Retrieval**: Support optional subject (`filter_subject`) and topic (`filter_topic`) metadata filtering alongside vector cosine similarity.
5. **Zero Breaking Changes**: Keep Phase 4A historical question bank (`bpsc_questions`) and existing production bot, Stage 0, Stage A, Stage B, and Telegram flows strictly separate and unchanged.

## Decision
- Implemented additive migration `db/migrations/0008_enhanced_vector_search.sql` enhancing `match_document_chunks` stored procedure to filter by `filter_subject` and `filter_topic` on `metadata`.
- Enhanced `src/scripts/ingest.ts` with SHA-256 checksum deduplication, page boundary tracking, subject/topic taxonomy mapping, and batch embedding calls.
- Built evidence retrieval module `src/rag/retrieval.ts` returning structured `EvidencePack` objects.
- Added comprehensive unit test suite `tests/unit/ragRetrieval.test.ts` testing 8 BPSC queries, chunking, page tracking, checksums, and vector retrieval.

## Consequences
- **Traceable Evidence**: All retrieved document chunks carry exact page numbers, document type, subject, and topic metadata.
- **Cost & Rate Limit Safety**: SHA-256 checksum check prevents re-processing and re-embedding unchanged documents.
- **Resilient Fallback**: Local simulation fallback handles network and Gemini API rate limits (`HTTP 429`) gracefully without pipeline failure.
- **Zero Regression**: 100% of unit tests pass (8 test suites, 43 total tests).
