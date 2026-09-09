import os
import sys
import json
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')

folder = r'knowledge-base\past-papers'
pdf_info = []

for root, dirs, files in os.walk(folder):
    for f in sorted(files):
        if f.lower().endswith('.pdf'):
            path = os.path.join(root, f)
            rel_path = os.path.relpath(path, folder)
            try:
                reader = PdfReader(path)
                num_pages = len(reader.pages)
                pages_detail = []
                total_chars = 0
                for idx, p in enumerate(reader.pages):
                    txt = (p.extract_text() or '').strip()
                    total_chars += len(txt)
                    pages_detail.append({
                        'page_num': idx + 1,
                        'char_count': len(txt),
                        'sample_text': txt[:200].replace('\n', ' ')
                    })
                pdf_info.append({
                    'rel_path': rel_path,
                    'filename': f,
                    'full_path': path,
                    'num_pages': num_pages,
                    'total_chars': total_chars,
                    'is_scanned': total_chars < 500,
                    'pages': pages_detail
                })
            except Exception as e:
                pdf_info.append({
                    'rel_path': rel_path,
                    'filename': f,
                    'full_path': path,
                    'num_pages': 0,
                    'total_chars': -1,
                    'is_scanned': True,
                    'error': str(e)
                })

print(f"Total PDF files inspected: {len(pdf_info)}\n")
print(f"{'Filename':45s} | {'Pages':5s} | {'Chars':7s} | {'Status'}")
print("-" * 80)
for item in pdf_info:
    status = "SCANNED / IMAGE" if item['is_scanned'] else "TEXT PARSABLE"
    print(f"{item['filename']:45s} | {item['num_pages']:5d} | {item['total_chars']:7d} | {status}")

with open(r'scratch\pdf_inventory_temp.json', 'w', encoding='utf-8') as out:
    json.dump(pdf_info, out, indent=2, ensure_ascii=False)
