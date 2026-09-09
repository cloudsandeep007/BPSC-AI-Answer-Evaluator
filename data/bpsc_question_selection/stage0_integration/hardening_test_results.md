# Question Selection Intelligence — Hardening Test Results (Phase 5.2.1)

## Executive Summary

- **Total Hardening Tests**: 7 / 7 PASS (100%)
- **Target Selection Algorithm Preserved**: 100% (Zero scoring weight or formula modifications)
- **Determinism**: 100% (0 differing outputs over 100 identical runs)
- **BPSC-SUB-10 Hardening**: 100% (Subject `BPSC-SUB-10` successfully marked unselectable for practice generation and throws clean error)

---

## Detailed Test Breakdown

| Test ID | Test Description | Condition / Input | Observed Result | Status |
|---|---|---|---|---|
| **TEST 1** | Panchayati Raj Overexposure Protection | Student history: 5 consecutive Panchayati Raj (`POLITY-004`) | Selector chose `POLITY-002` (Judiciary). Panchayati Raj was successfully penalized. | **PASS** |
| **TEST 2** | Six Polity Topics Reachability | Cold-start student, 100 sequential selections in Polity (`BPSC-SUB-02`) | All 6 Polity topics (`POLITY-001` through `POLITY-006`) were reached. | **PASS** |
| **TEST 3** | Maximum Consecutive Repetition Bound | 100 sequential selections with history tracking | Maximum consecutive same-topic selection = 1 (no back-to-back repetitions). | **PASS** |
| **TEST 4** | Determinism Verification | 100 identical selection runs (`BPSC-SUB-02`, SHORT_ANSWER, same history) | 0 differing outputs across all 100 runs. | **PASS** |
| **TEST 5** | Personalization Math Verification | Increasing history depth (0, 1, 2, 3+ exposures) | Exposure scores: `1.00 → 0.70 → 0.40 → 0.10`. Repetition penalties: `0.00 → 0.15 → 0.30 → 0.50`. | **PASS** |
| **TEST 6** | Rare Topic Reachability | High-frequency topics practiced | Lower-frequency topics (`HIST-005`, `POLITY-006`) surfaced appropriately. | **PASS** |
| **TEST 7** | Subject Coverage & BPSC-SUB-10 Hardening | Subjects `BPSC-SUB-01` to `BPSC-SUB-10` selection test | `BPSC-SUB-01` to `09` succeeded. `BPSC-SUB-10` rejected with clean error message. | **PASS** |

---

## Verified Personalization Parameters

```json
{
  "student_exposure_decay": [1.00, 0.70, 0.40, 0.10],
  "repetition_penalties": [0.00, 0.15, 0.30, 0.50],
  "max_consecutive_repetition": 1,
  "determinism_guarantee": "SAME INPUT -> SAME OUTPUT"
}
```
