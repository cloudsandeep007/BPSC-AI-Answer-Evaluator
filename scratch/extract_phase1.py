import os
import sys
import re
import csv
import json
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')

# Directories
SOURCE_DIR = r'knowledge-base\past-papers'
STAGING_DIR = r'data\bpsc_question_bank\staging'

os.makedirs(STAGING_DIR, exist_ok=True)

# Field definitions:
# question_id, year, exam_name, paper, section, question_number, marks, language, original_question_text, page_number, source_pdf_name

all_questions = []
q_counter = 1

def generate_qid():
    global q_counter
    qid = f"BPSC-Q-{q_counter:06d}"
    q_counter += 1
    return qid

def detect_language(text):
    has_hindi = bool(re.search(r'[\u0900-\u097F]', text))
    has_english = bool(re.search(r'[a-zA-Z]', text))
    if has_hindi and has_english:
        return 'Bilingual'
    elif has_hindi:
        return 'Hindi'
    elif has_english:
        return 'English'
    return 'Unknown'

# Inventory list
pdf_inventory = []

# Helper to add question
def add_question(year, exam_name, paper, section, q_num, marks, text, page_num, pdf_name):
    lang = detect_language(text)
    qid = generate_qid()
    record = {
        "question_id": qid,
        "year": int(year) if year and str(year).isdigit() else None,
        "exam_name": exam_name,
        "paper": paper,
        "section": section or "",
        "question_number": str(q_num),
        "marks": int(marks) if marks and str(marks).isdigit() else (float(marks) if marks else None),
        "language": lang,
        "original_question_text": text.strip(),
        "page_number": int(page_num) if page_num else None,
        "source_pdf_name": pdf_name
    }
    all_questions.append(record)
    return record

print("Phase 1 Extraction Script Starting...")
