# Baseline Test Results — Phase 6 E2E Validation

## Pre-Execution Baseline Audit

- **Execution Command**: `npm test`
- **Total Test Files**: 12 test suites
- **Total Baseline Tests**: 79 / 79 PASS (100%)
- **Test Execution Runtime**: ~8.2 seconds
- **Calibration Verification**: `npm run verify:calibration` — 100% PASS

---

## Detailed Test Suite Summary

| Test Suite File | Test Count | Result | Key Areas Tested |
|---|---|---|---|
| `tests/unit/blueprint.test.ts` | 2 | PASS | Quality checker & evaluation blueprint validation |
| `tests/unit/questionBank.test.ts` | 13 | PASS | Question bank querying, filtering, subject taxonomy |
| `tests/unit/calibration.test.ts` | 8 | PASS | Score calculation arithmetic & realism caps |
| `tests/unit/gateway.test.ts` | 3 | PASS | AI gateway structured output, error retries, token usage |
| `tests/unit/attempt.test.ts` | 3 | PASS | Submission & attempt tracking logic |
| `tests/unit/storage.test.ts` | 2 | PASS | Supabase Storage path generation & MIME type handling |
| `tests/unit/questionSelection.test.ts` | 12 | PASS | Question Selection Intelligence factors & scoring |
| `tests/unit/questionSelectionHardening.test.ts` | 7 | PASS | Panchayati Raj protection, reachability, determinism, decay |
| `tests/unit/stage0SelectionIntegration.test.ts` | 7 | PASS | Stage 0 selection binding, zero topic drift, zero type drift |
| `tests/unit/queue.test.ts` | 1 | PASS | BullMQ queue scheduling & dev fallback |
| `tests/unit/ragRetrieval.test.ts` | 11 | PASS | NCERT vector retrieval, page tracking, checksums |
| `tests/unit/e2eStudentJourney.test.ts` | 10 | PASS | Full student journey validation, report cards, history |

---

## Status

**PASSED — Baseline Verified 100% Clean.**
