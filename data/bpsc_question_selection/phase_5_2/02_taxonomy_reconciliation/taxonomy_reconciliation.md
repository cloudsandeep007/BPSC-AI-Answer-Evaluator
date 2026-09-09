# Taxonomy Reconciliation Report — Phase 5.2

## Discrepancy Summary
- **Phase 5 ADR 0001 Narrative**: Mentioned 32 topics as a preliminary narrative estimate during early data exploration.
- **Phase 5.1 & Phase 5.2 Runtime Data**: Exactly **29 topics** exist in `topic_taxonomy_v1.json` and are inserted into `bpsc_topics`.
- **Question Coverage**: All 603 production historical questions map strictly to these 29 topics across 9 active subjects.
- **Subject BPSC-SUB-10**: General & Miscellaneous has 0 topics defined in `topic_taxonomy_v1.json`.

## Subject-wise Topic Distribution Matrix

| Subject ID | Subject Name | Topic Count | Questions Count | Selectable? |
|:---|:---|:---:|:---:|:---:|
| **BPSC-SUB-01** | History, Art & Culture | 5 | 147 | YES |
| **BPSC-SUB-02** | Polity & Governance | 6 | 82 | YES |
| **BPSC-SUB-03** | Indian & Bihar Economy | 3 | 74 | YES |
| **BPSC-SUB-04** | Geography & Disaster Management | 3 | 68 | YES |
| **BPSC-SUB-05** | Science & Technology | 3 | 71 | YES |
| **BPSC-SUB-06** | Current Affairs & IR | 3 | 59 | YES |
| **BPSC-SUB-07** | Statistics & Data Interpretation | 1 | 36 | YES |
| **BPSC-SUB-08** | Essay & Philosophical Themes | 3 | 45 | YES |
| **BPSC-SUB-09** | Geography Optional | 2 | 21 | YES |
| **BPSC-SUB-10** | General & Miscellaneous | 0 | 0 | **NO (0 topics)** |
