# BPSC Phase 4A Database Import Audit Report

**Audit Date**: 2026-09-09  
**Source Dataset**: `data/bpsc_question_bank/topic_analysis/bpsc_questions_topic_classified.json`  
**Production Staging Directory**: `data/bpsc_question_bank/production/`  

---

## 1. Audit Summary

- **Total Phase 3 Input Records**: 626
- **Valid Production Questions**: 603
- **Excluded Structural / Header Records**: 23
- **Review-Required Records (< 0.80 Confidence)**: 0

---

## 2. Excluded Structural Records (23 Total)

The following 23 records were identified as paper section headers/instructions and moved to `bpsc_questions_excluded.csv`:

- **BPSC-Q-000021** (`68th-MainsGS-1.pdf` p.3): *"**Short Answer Questions (Compulsory - 38 Marks Total):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000027** (`68th-MainsGS-1.pdf` p.3): *"**Long Answer Question (History & Movement):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000030** (`68th-MainsGS-1.pdf` p.3): *"**Long Answer Question (Art & Thinkers):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000033** (`68th-MainsGS-1.pdf` p.3): *"**Short Answer Questions:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000039** (`68th-MainsGS-1.pdf` p.3): *"**Long Answer Question:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000042** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000048** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000050** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000056** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000058** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000064** (`68th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question:**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000075** (`69th_BPSC_MAINS_GS_PAPER-I.pdf` p.3): *"**Short Answer Questions (Compulsory - 38 Marks Total):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000081** (`69th_BPSC_MAINS_GS_PAPER-I.pdf` p.3): *"**Long Answer Question (History & Movement):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000084** (`69th_BPSC_MAINS_GS_PAPER-I.pdf` p.3): *"**Long Answer Question (National Movement & Thinkers):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000087** (`69th_BPSC_MAINS_GS_PAPER-I.pdf` p.3): *"**Short Answer Questions (Current Developments):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000093** (`69th_BPSC_MAINS_GS_PAPER-I.pdf` p.3): *"**Long Answer Question (International Relations):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000096** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions (Polity):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000102** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question (Polity):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000105** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions (Economy & Geography):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000111** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question (Economy & Geography):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000113** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Short Answer Questions (Science & Tech):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000119** (`69th_BPSC_MAINS_GS_PAPER-II.pdf` p.3): *"**Long Answer Question (Science & Tech):**..."* (Reason: Structural section/header text rather than actual question.)
- **BPSC-Q-000283** (`71st BPSC MAINS ESSAY PAPER (25-04-2026).pdf` p.1): *"ESSAY SECTION - I Write an essay on any one of the following topics in about 700..."* (Reason: Structural section/header text rather than actual question.)

---

## 3. Question Type Breakdown in Production Dataset

- **LONG_ANSWER**: 429 questions (71.14%)
- **SHORT_ANSWER**: 77 questions (12.77%)
- **PRELIMS_MCQ**: 54 questions (8.96%)
- **ESSAY**: 36 questions (5.97%)
- **DATA_INTERPRETATION**: 7 questions (1.16%)
