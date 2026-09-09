# ADR 0004: Question Selection Intelligence Sequential Calibration & Diagnostics

## Status
APPROVED (Phase 5.2 Completed)

## Date
2026-09-09

## Context
Phase 5 introduced a deterministic, database-driven Question Selection Intelligence engine to solve topic over-generation (e.g. Panchayati Raj repetition). Phase 5.1 evaluated isolated cold-start scenarios. Phase 5.2 performed empirical sequential calibration diagnostics over realistic multi-iteration student practice sessions to verify whether topic rotation, personalization, anti-repetition penalties, and factor calculations behave correctly over time.

## Decision
1. **Preserve Selection Architecture & Scoring Weights**: Maintain the 6-factor weighted scoring model (Relevance 25%, Recency 20%, Question-Type Fit 15%, Marks Fit 10%, Exposure 20%, Diversity 10%) and non-linear repetition penalty curve (-0.15 for 1 exp, -0.30 for 2 exp, -0.50 for 3+ exp).
2. **Reconcile Taxonomy Discrepancy**: Document that the actual production taxonomy (`topic_taxonomy_v1.json`) contains exactly **29 topics** across 9 active subjects (`BPSC-SUB-01` to `BPSC-SUB-09`), mapping 100% of the 603 historical BPSC questions. (Preliminary Phase 5 narrative estimate of 32 topics was reconciled).
3. **Verify Anti-Repetition Recovery**: Confirmed that heavy student over-exposure (10x Panchayati Raj) activates a max -0.50 penalty, cleanly rotating selection to alternative Polity topics (Judiciary, Executive, Federalism, Elections).
4. **Frequency vs Personalization Threshold**: Empirically proved that exactly **2 consecutive practice attempts** on a high-frequency topic (`HIST-001`, 147 past questions) are required for personalization to overcome historical frequency advantage.
5. **Subject Coverage Finding**: Subject `BPSC-SUB-10` (General & Miscellaneous) has 0 taxonomy topics and throws a controlled error when selected. Product Owner recommendation: add 2-3 topics or remove from user dropdowns.

## Consequences
- **Positive**: Proven sequential topic rotation across all 6 Polity topics with 0 back-to-back sticky locking (max 1 consecutive repetition).
- **Positive**: 100% determinism preserved across 100 identical runs.
- **Positive**: All 55 baseline unit tests pass 100%. Zero breaking changes introduced.
- **Integration Readiness**: **READY WITH CONDITIONS** (Condition: Resolve `BPSC-SUB-10` dropdown handling prior to production launch).
