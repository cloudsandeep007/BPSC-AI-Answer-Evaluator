# BPSC Phase 1 Question Extraction & Completeness Report

**Extraction Date**: 2026-09-09  
**Target Directory**: `data/bpsc_question_bank/staging/`  

---

## 1. Executive Summary

- **Total Source PDFs Processed**: 26
- **Total PDF Pages Processed**: 246
- **Total Unique Questions Extracted**: 626

---

## 2. Extraction Breakdown by Year

| Year | Extracted Question Count |
|------|--------------------------|
| 2018 | 27 |
| 2019 | 55 |
| 2020 | 45 |
| 2022 | 20 |
| 2023 | 108 |
| 2024 | 55 |
| 2025 | 24 |
| 2026 | 292 |

---

## 3. Extraction Breakdown by Paper

| Paper | Extracted Question Count |
|-------|--------------------------|
| Essay | 37 |
| GS 1 | 129 |
| GS 2 | 125 |
| GS Prelims | 54 |
| Geography Optional | 281 |

---

## 4. Extraction Breakdown by Language

| Language | Extracted Question Count |
|----------|--------------------------|
| Bilingual | 6 |
| English | 518 |
| Unknown | 102 |

---

## 5. Verification & Traceability Audit

- **Unique Question IDs**: 100% Verified (`BPSC-Q-000001` to `BPSC-Q-000626`).
- **Schema Compliance**: All 11 required fields present in CSV & JSON.
- **Traceability**: Every question links directly to `source_pdf_name` and PDF `page_number`.
- **Character Encoding**: 100% UTF-8 preserving original Hindi (Devanagari) and English text.
