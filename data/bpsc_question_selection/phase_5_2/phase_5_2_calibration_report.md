# Phase 5.2 Calibration & Behavioral Diagnostics Report

Generated at: 2026-09-08T20:37:33.812Z

## 1. Executive Summary
**Integration Readiness**: **READY WITH CONDITIONS**

The Question Selection Intelligence engine behaves with high mathematical precision, anti-repetition, and topic rotation over sequential student practice sessions. The engine successfully eliminates topic lock-in (e.g. Panchayati Raj repetition) and rotates smoothly across all available topics in each subject.

## 2. Baseline
- **Existing Unit Tests**: 55 / 55 PASS (100%) across 9 test files.
- **Regressions**: 0 regressions detected.

## 3. Taxonomy Reconciliation
- **Phase 5 ADR 0001 Narrative**: Cited 32 topics as a preliminary estimate.
- **Actual Production Taxonomy**: Exactly **29 topics** defined in `topic_taxonomy_v1.json` across 9 active subjects.
- **Question Coverage**: All 603 historical BPSC questions map to these 29 topics.

## 4. Sequential Behavior & Polity Concentration
- In a 100-run sequential practice simulation, the engine selected **all 6/6 Polity topics**.
- Cold-start initial pick favors Judiciary (`POLITY-002`), but after 1-2 attempts, anti-repetition penalties rotate selection cleanly to Executive, Federalism, Elections, and Panchayati Raj.

## 5. Personalization & Over-Exposure Recovery
- A student heavily exposed to Panchayati Raj (10x attempts) receives a **-0.50 penalty**, dropping Panchayati Raj's score from 0.772 to 0.272.
- The engine immediately rotates selection to alternative Polity topics.

## 6. Frequency vs Personalization Tradeoff
- Exactly **2 consecutive practice attempts** on a high-frequency topic are required for student personalization to overcome historical frequency advantage.

## 7. Score Decomposition & Factor Audit
- All 7 factors (`historical_frequency_score`, `recency_score`, `question_type_fit_score`, `marks_fit_score`, `student_exposure_score`, `diversity_score`, `repetition_penalty`) exhibit dynamic, non-constant values across candidate rankings.

## 8. Subject Coverage Finding
- **BPSC-SUB-10 (General & Miscellaneous)** has 0 taxonomy topics and throws a controlled error when selected.

## 9. Product Risks & Classification
- **LOW RISK**: `BPSC-SUB-10` missing topics (handled gracefully by throwing clear error).
- **LOW RISK**: Cold-start determinism always picks Judiciary as topic #1 for Polity (expected due to highest recency/frequency weight).

## 10. Recommended Changes (For Product Owner Review)
1. **Define Topics for BPSC-SUB-10**: Add 2-3 General & Miscellaneous topics to `topic_taxonomy_v1.json` or remove `BPSC-SUB-10` from user dropdowns.
2. **Optional Randomization Toggle**: Consider adding an optional small random jitter (±0.02 score delta) if non-deterministic cold-start topic variety is desired by product requirements in the future.

## 11. Stage 0 Integration Decision
**READY WITH CONDITIONS** (Condition: Ensure `BPSC-SUB-10` dropdown handling or topic definitions are finalized before user launch).
