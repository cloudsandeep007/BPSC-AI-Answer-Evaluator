import os
import sys
import re
import csv
import json
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = r'c:\Users\DELL\BPSC-AI-Answer-Evaluator'
KB_DIR = os.path.join(ROOT_DIR, r'knowledge-base\past-papers')
STAGING_DIR = os.path.join(ROOT_DIR, r'data\bpsc_question_bank\staging')

os.makedirs(STAGING_DIR, exist_ok=True)

all_questions = []
review_notes = []
pdf_inventory = []
q_counter = 1

def get_next_qid():
    global q_counter
    qid = f"BPSC-Q-{q_counter:06d}"
    q_counter += 1
    return qid

def detect_language(text):
    if not text:
        return "Unknown"
    has_hindi = bool(re.search(r'[\u0900-\u097F]', text))
    has_english = bool(re.search(r'[a-zA-Z]', text))
    if has_hindi and has_english:
        return 'Bilingual'
    elif has_hindi:
        return 'Hindi'
    elif has_english:
        return 'English'
    return 'Unknown'

def add_record(year, exam_name, paper, section, question_number, marks, original_question_text, page_number, source_pdf_name):
    lang = detect_language(original_question_text)
    record = {
        "question_id": get_next_qid(),
        "year": int(year) if year and str(year).isdigit() else None,
        "exam_name": exam_name,
        "paper": paper,
        "section": section or "",
        "question_number": str(question_number),
        "marks": int(marks) if marks is not None and str(marks).isdigit() else (float(marks) if marks is not None else None),
        "language": lang,
        "original_question_text": original_question_text.strip(),
        "page_number": int(page_number) if page_number else None,
        "source_pdf_name": source_pdf_name
    }
    all_questions.append(record)
    return record

print("Starting complete Phase 1 question extraction...")

# ==========================================
# 1. MARKDOWN DIRECT SOURCE MATCHES (67th, 68th, 69th Mains)
# ==========================================

# --- 67th BPSC Mains (2022) ---
md_67 = os.path.join(KB_DIR, 'mains', '67th_BPSC_Mains_Questions_2022.md')
if os.path.exists(md_67):
    with open(md_67, 'r', encoding='utf-8') as f:
        content = f.read()
    current_paper = "GS 1"
    current_sec = "Section I"
    pdf_name = "67thMainsGS1-2022.pdf"
    for line in content.splitlines():
        line = line.strip()
        if "General Studies Paper 2" in line:
            current_paper = "GS 2"
            pdf_name = "67thMainsGS2-2022.pdf"
        elif "Section I" in line or "Section 1" in line:
            current_sec = "Section I"
        elif "Section II" in line or "Section 2" in line:
            current_sec = "Section II"
        elif "Section III" in line or "Section 3" in line:
            current_sec = "Section III"
        elif re.match(r'^\d+\.', line):
            m = re.match(r'^(\d+)\.\s*(.*?)(?:\[(\d+)\s*Marks\])?$', line)
            if m:
                qnum = m.group(1)
                qtext = m.group(2).strip()
                marks = m.group(3) if m.group(3) else (72 if current_sec == "Section III" else 38)
                page = 2 if current_sec == "Section I" else (4 if current_sec == "Section II" else 7)
                add_record(2022, "67th BPSC Mains", current_paper, current_sec, qnum, marks, qtext, page, pdf_name)

# --- 68th BPSC Mains (2023) ---
md_68 = os.path.join(KB_DIR, 'mains', '68th_BPSC_Mains_Questions_2023.md')
if os.path.exists(md_68):
    with open(md_68, 'r', encoding='utf-8') as f:
        content = f.read()
    current_paper = "GS 1"
    current_sec = "Section I"
    pdf_name = "68th-MainsGS-1.pdf"
    for line in content.splitlines():
        line = line.strip()
        if "General Studies Paper 2" in line:
            current_paper = "GS 2"
            pdf_name = "68th_BPSC_MAINS_GS_PAPER-II.pdf"
        elif "Essay Paper" in line:
            current_paper = "Essay"
            pdf_name = "68th mains essay  (Final) (1).pdf"
        elif "Section I" in line:
            current_sec = "Section I"
        elif "Section II" in line:
            current_sec = "Section II"
        elif "Section III" in line:
            current_sec = "Section III"
        elif line.startswith("- ("):
            m = re.match(r'^-\s*\(([a-z0-9]+)\)\s*(.*?)(?:\[(\d+)\s*Marks.*?\])?$', line)
            if m:
                subnum = m.group(1)
                qtext = m.group(2).strip()
                marks = m.group(3) if m.group(3) else 8
                add_record(2023, "68th BPSC Mains", current_paper, current_sec, f"Sub-{subnum}", marks, qtext, 2, pdf_name)
        elif re.match(r'^\d+\.', line):
            m = re.match(r'^(\d+)\.\s*(.*?)(?:\[(\d+)\s*Marks.*?\])?$', line)
            if m:
                qnum = m.group(1)
                qtext = m.group(2).strip()
                marks = m.group(3) if m.group(3) else (100 if current_paper == "Essay" else 38)
                add_record(2023, "68th BPSC Mains", current_paper, current_sec, qnum, marks, qtext, 3, pdf_name)

# --- 69th BPSC Mains (2024) ---
md_69 = os.path.join(KB_DIR, 'mains', '69th_BPSC_Mains_Questions_2024.md')
if os.path.exists(md_69):
    with open(md_69, 'r', encoding='utf-8') as f:
        content = f.read()
    current_paper = "GS 1"
    current_sec = "Section I"
    pdf_name = "69th_BPSC_MAINS_GS_PAPER-I.pdf"
    for line in content.splitlines():
        line = line.strip()
        if "General Studies Paper 2" in line:
            current_paper = "GS 2"
            pdf_name = "69th_BPSC_MAINS_GS_PAPER-II.pdf"
        elif "Essay Paper" in line:
            current_paper = "Essay"
            pdf_name = "69th_BPSC_MAINS_ESSAY.pdf"
        elif "Section I" in line:
            current_sec = "Section I"
        elif "Section II" in line:
            current_sec = "Section II"
        elif "Section III" in line:
            current_sec = "Section III"
        elif line.startswith("- ("):
            m = re.match(r'^-\s*\(([a-z0-9]+)\)\s*(.*?)(?:\[(\d+)\s*Marks.*?\])?$', line)
            if m:
                subnum = m.group(1)
                qtext = m.group(2).strip()
                marks = m.group(3) if m.group(3) else 8
                add_record(2024, "69th BPSC Mains", current_paper, current_sec, f"Sub-{subnum}", marks, qtext, 2, pdf_name)
        elif re.match(r'^\d+\.', line):
            m = re.match(r'^(\d+)\.\s*(.*?)(?:\[(\d+)\s*Marks.*?\])?$', line)
            if m:
                qnum = m.group(1)
                qtext = m.group(2).strip()
                marks = m.group(3) if m.group(3) else (100 if current_paper == "Essay" else 38)
                add_record(2024, "69th BPSC Mains", current_paper, current_sec, qnum, marks, qtext, 3, pdf_name)

# ==========================================
# 2. PARSE TEXT-BASED PDF FILES
# ==========================================

text_pdfs_config = [
    # (relative_path, year, exam_name, paper)
    (r'mains\BPSC-(60-62)-Mains-exam-GS-1.pdf', 2018, '60th-62nd BPSC Mains', 'GS 1'),
    (r'mains\BPSC-(60-62)-Mains-exam-GS-2.pdf', 2018, '60th-62nd BPSC Mains', 'GS 2'),
    (r'mains\BPSC-(63rd)-Mains-exam-GS-1.pdf', 2019, '63rd BPSC Mains', 'GS 1'),
    (r'mains\BPSC-(63rd)-Mains-exam-GS-2.pdf', 2019, '63rd BPSC Mains', 'GS 2'),
    (r'mains\BPSC-64th-Mains-exam-GS-1.pdf', 2019, '64th BPSC Mains', 'GS 1'),
    (r'mains\BPSC-64th-Mains-exam-GS-2.pdf', 2019, '64th BPSC Mains', 'GS 2'),
    (r'mains\BPSC-65th-Mains-Exam-GS-1.pdf', 2020, '65th BPSC Mains', 'GS 1'),
    (r'mains\BPSC-65th-Mains-Exam-GS-2.pdf', 2020, '65th BPSC Mains', 'GS 2'),
    (r'mains\(2020)66thMainsGS2.pdf', 2020, '66th BPSC Mains', 'GS 2'),
    (r'mains\70th_BPSC_Mains_Essay_Paper.pdf', 2025, '70th BPSC Mains', 'Essay'),
    (r'mains\70th_BPSC_Mains_General_Studies_1.pdf', 2025, '70th BPSC Mains', 'GS 1'),
    (r'mains\70th_BPSC_Mains_General_Studies_2.pdf', 2025, '70th BPSC Mains', 'GS 2'),
    (r'mains\71st BPSC MAINS ESSAY PAPER (25-04-2026).pdf', 2026, '71st BPSC Mains', 'Essay'),
    (r'optional\Geography Optional_71st BPSC Mains.pdf', 2026, '71st BPSC Mains', 'Geography Optional'),
    (r'prelims\68th bpsc pre.pdf', 2023, '68th BPSC Prelims', 'GS Prelims'),
]

for rel_path, year, exam_name, paper in text_pdfs_config:
    full_path = os.path.join(KB_DIR, rel_path)
    pdf_filename = os.path.basename(full_path)
    if not os.path.exists(full_path):
        continue
    
    reader = PdfReader(full_path)
    current_sec = ""
    for pg_idx, page in enumerate(reader.pages):
        pg_num = pg_idx + 1
        text = page.extract_text() or ""
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        
        buffer_qnum = None
        buffer_text = []
        buffer_marks = None
        
        for line in lines:
            # Check section header
            if "Section" in line or "Part" in line or "SECTION" in line or "PART" in line or "खंड" in line or "भाग" in line:
                if "Section-I" in line or "Section I" in line or "SECTION-I" in line or "SECTION I" in line or "Section -I" in line or "Section - I" in line:
                    current_sec = "Section I"
                elif "Section-II" in line or "Section II" in line or "SECTION-II" in line or "SECTION II" in line or "Section -II" in line or "Section - II" in line:
                    current_sec = "Section II"
                elif "Section-III" in line or "Section III" in line or "SECTION-III" in line or "SECTION III" in line or "Section -III" in line or "Section - III" in line:
                    current_sec = "Section III"
                elif "Part-I" in line or "Part I" in line or "Part A" in line:
                    current_sec = "Part I"
                elif "Part-II" in line or "Part II" in line or "Part B" in line:
                    current_sec = "Part II"

            # Check question start pattern like 1., 2., 3., (a), (b), (c)
            q_match = re.match(r'^(\d+|\([a-z0-9]+\))\s*[\.\:\-\)]\s*(.*)', line, re.IGNORECASE)
            if q_match:
                # Flush previous question if stored
                if buffer_qnum and buffer_text:
                    full_qtext = " ".join(buffer_text)
                    add_record(year, exam_name, paper, current_sec, buffer_qnum, buffer_marks, full_qtext, pg_num, pdf_filename)
                
                buffer_qnum = q_match.group(1).replace('(', '').replace(')', '')
                buffer_text = [q_match.group(2)]
                
                # Check inline marks at end of line like 38 or 8 or [38 Marks]
                marks_m = re.search(r'(\d+)\s*$', line)
                buffer_marks = int(marks_m.group(1)) if marks_m and int(marks_m.group(1)) in [6, 7, 8, 12, 16, 25, 36, 38, 50, 72, 100] else None
            else:
                if buffer_qnum:
                    buffer_text.append(line)
                    if not buffer_marks:
                        marks_m = re.search(r'(\d+)\s*$', line)
                        if marks_m and int(marks_m.group(1)) in [6, 7, 8, 12, 16, 25, 36, 38, 50, 72, 100]:
                            buffer_marks = int(marks_m.group(1))
        
        # Flush last question of page
        if buffer_qnum and buffer_text:
            full_qtext = " ".join(buffer_text)
            add_record(year, exam_name, paper, current_sec, buffer_qnum, buffer_marks, full_qtext, pg_num, pdf_filename)

print(f"Total extracted question records across all sources: {len(all_questions)}")
