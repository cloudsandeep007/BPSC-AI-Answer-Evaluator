# ADR 0003: Deterministic & Explainable BPSC Question Selection Intelligence Engine

## Status
APPROVED

## Date
2026-09-09

## Context
In Phase 5 of the BPSC AI Mentor project, a deterministic Question Selection Intelligence layer was built to decide which target topic should be selected for question generation next.

Key requirements:
1. **Solve Over-Generation Bug**: Prevent repeated selection of single topics (such as Panchayati Raj in Polity) when students request practice questions.
2. **Zero LLM / Gemini Call**: Topic selection must be 100% deterministic, transparent, explainable, and fast, relying on production database statistics and student practice history.
3. **Multi-Factor Weighted Scoring Model**:
   - Historical BPSC Relevance: 25%
   - Recency Decay: 20%
   - Question-Type Fit: 15%
   - Marks Fit: 10%
   - Student Practice Exposure / Need: 20%
   - Topic Diversity: 10%
4. **Anti-Repetition Penalty**: Apply up to a **-0.50 score penalty** on topics recently practiced by a student, forcing topic rotation across candidate topics (e.g. from Panchayati Raj to Federalism, Judiciary, or Executive).
5. **Zero Breaking Changes**: Keep Stage 0, Stage A, Stage B, Telegram flows, OCR, and Phase 4A historical question bank tables completely untouched.

## Decision
- Built selection engine in `src/questionSelection/` featuring:
  - `types.ts`: TypeScript contracts for inputs, results, factors, and statistics.
  - `config.ts`: Configurable scoring weights and penalty thresholds.
  - `topicStatistics.ts`: Dynamic SQL/database aggregation calculating topic stats from `bpsc_questions`.
  - `historyService.ts`: Queries student practice history from `submissions` / `attempts`.
  - `scoring.ts`: Pure scoring engine calculating normalized component scores and repetition penalties.
  - `queryBuilder.ts`: Deterministic helper to construct future RAG retrieval query strings.
  - `questionSelection.ts`: Main entry point `selectTargetTopic(input)`.

## Consequences
- **Explainable Selection**: Every selection produces a detailed factor breakdown and natural language explanation.
- **Intelligent Diversification**: Verified via 20-run cold-start and over-exposure simulations that topic rotation is healthy.
- **Zero API Cost & High Performance**: Runs in tens of milliseconds with zero LLM/Gemini API dependency.
- **Zero Regression**: All 55 unit tests across 9 test suites pass 100%.
