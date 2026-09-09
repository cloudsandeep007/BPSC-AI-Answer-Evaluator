import json
import re
from collections import Counter

with open(r'data\bpsc_question_bank\staging\bpsc_questions_raw.json', 'r', encoding='utf-8') as f:
    questions = json.load(f)

print(f"Analyzing corpus of {len(questions)} questions for Subject Taxonomy Discovery...\n")

# Let's inspect questions by paper & section
sec_counter = Counter()
for q in questions:
    key = f"{q['paper']} | {q['section']}"
    sec_counter[key] += 1

for k, v in sec_counter.most_common():
    print(f"{k:40s} : {v:4d} questions")
