import os
import sys
import re
import csv
import json
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r'c:\Users\DELL\BPSC-AI-Answer-Evaluator'
PHASE3_FILE = os.path.join(ROOT_DIR, r'data\bpsc_question_bank\topic_analysis\bpsc_questions_topic_classified.json')
PROD_DIR = os.path.join(ROOT_DIR, r'data\bpsc_question_bank\production')

os.makedirs(PROD_DIR, exist_ok=True)

with open(PHASE3_FILE, 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Phase 4A Audit starting. Inspecting {len(questions)} Phase 3 questions...")

excluded_records = []
production_records = []
review_records = []

# List of structural header text prefixes
HEADER_PREFIXES = [
    "**short answer questions",
    "**long answer question",
    "short answer questions",
    "long answer question",
    "answer the following questions",
    "write short notes on the following",
    "fueufyf[kr esa ls fdUgha",
    "section -",
    "kam&"
]

def is_structural_header(text):
    t = text.strip().lower()
    for pref in HEADER_PREFIXES:
        if t.startswith(pref) or pref in t[:40]:
            return True
    return False

def determine_question_type(q):
    paper = q.get('paper', '')
    top_id = q.get('primary_topic_id', '')
    qnum = str(q.get('question_number', ''))
    marks = q.get('marks')

    if paper == "Essay":
        return "ESSAY"
    elif top_id == "STAT-001":
        return "DATA_INTERPRETATION"
    elif paper == "GS Prelims":
        return "PRELIMS_MCQ"
    elif 'sub' in qnum.lower() or (marks and marks <= 10):
        return "SHORT_ANSWER"
    elif marks and marks >= 36:
        return "LONG_ANSWER"
    return "LONG_ANSWER"

for q in questions:
    text = q.get('original_question_text', '').strip()
    
    if is_structural_header(text):
        q_ex = dict(q)
        q_ex['reason_for_exclusion'] = 'Structural section/header text rather than actual question.'
        excluded_records.append(q_ex)
    else:
        q_prod = dict(q)
        q_prod['question_type'] = determine_question_type(q)
        production_records.append(q_prod)
        if q_prod.get('topic_review_required') or q_prod.get('topic_confidence', 1.0) < 0.80:
            review_records.append(q_prod)

print(f"Audit Complete.")
print(f"Total Phase 3 Input Questions: {len(questions)}")
print(f"Valid Production Questions: {len(production_records)}")
print(f"Excluded Structural Records: {len(excluded_records)}")
print(f"Review-Required Questions: {len(review_records)}")

# Export Production JSON
prod_json_path = os.path.join(PROD_DIR, 'bpsc_questions_production.json')
with open(prod_json_path, 'w', encoding='utf-8') as f:
    json.dump(production_records, f, indent=2, ensure_ascii=False)

# Export Production CSV
prod_csv_path = os.path.join(PROD_DIR, 'bpsc_questions_production.csv')
fields = list(production_records[0].keys())

with open(prod_csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(production_records)

# Export Excluded CSV
ex_csv_path = os.path.join(PROD_DIR, 'bpsc_questions_excluded.csv')
ex_fields = list(questions[0].keys()) + ['reason_for_exclusion']
ex_fields = list(dict.fromkeys(ex_fields))

with open(ex_csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=ex_fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(excluded_records)

# Export Review Required CSV
rev_csv_path = os.path.join(PROD_DIR, 'bpsc_questions_review_required.csv')
with open(rev_csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(review_records)

# Export Database Import Report MD
import_report_md = f"""# BPSC Phase 4A Database Import Audit Report

**Audit Date**: 2026-09-09  
**Source Dataset**: `data/bpsc_question_bank/topic_analysis/bpsc_questions_topic_classified.json`  
**Production Staging Directory**: `data/bpsc_question_bank/production/`  

---

## 1. Audit Summary

- **Total Phase 3 Input Records**: {len(questions)}
- **Valid Production Questions**: {len(production_records)}
- **Excluded Structural / Header Records**: {len(excluded_records)}
- **Review-Required Records (< 0.80 Confidence)**: {len(review_records)}

---

## 2. Excluded Structural Records ({len(excluded_records)} Total)

The following {len(excluded_records)} records were identified as paper section headers/instructions and moved to `bpsc_questions_excluded.csv`:

"""

for ex in excluded_records:
    import_report_md += f"- **{ex['question_id']}** (`{ex['source_pdf_name']}` p.{ex['page_number']}): *\"{ex['original_question_text'][:80]}...\"* (Reason: {ex['reason_for_exclusion']})\n"

qtype_counts = Counter(q['question_type'] for q in production_records)
import_report_md += f"""
---

## 3. Question Type Breakdown in Production Dataset

"""

for qt, cnt in qtype_counts.most_common():
    import_report_md += f"- **{qt}**: {cnt} questions ({(cnt/len(production_records))*100:.2f}%)\n"

report_path = os.path.join(PROD_DIR, 'database_import_report.md')
with open(report_path, 'w', encoding='utf-8') as f:
    f.write(import_report_md)

print(f"Exported All Phase 4A Production Datasets to {PROD_DIR}")
