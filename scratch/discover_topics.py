import json
import re
from collections import Counter

with open(r'data\bpsc_question_bank\subject_classification\bpsc_questions_subject_classified.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Phase 3 Discovery initialized. Analyzing {len(questions)} classified questions...\n")

polity_qs = [q for q in questions if q['subject_id'] == 'BPSC-SUB-02']
print(f"Total Polity Questions (BPSC-SUB-02): {len(polity_qs)}\n")

for idx, q in enumerate(polity_qs, 1):
    txt = q['original_question_text'].replace('\n', ' ')
    print(f"Q{idx:02d} [{q['year']} | {q['paper']} | Q{q['question_number']}]: {txt[:110]}...")
