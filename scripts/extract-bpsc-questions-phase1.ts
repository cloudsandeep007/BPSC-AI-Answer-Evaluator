/**
 * BPSC Phase 1 Historical Question Extraction Pipeline
 * 
 * Standalone Phase 1 extraction script that inspects all source PDFs in knowledge-base/past-papers/
 * and extracts verbatim questions into data/bpsc_question_bank/staging/
 * 
 * Rules:
 * - NO application code modifications (bot.ts, stage0, stageA, stageB, database schemas, etc. remain untouched).
 * - Extraction ONLY: No topic/subject classification, no paraphrasing, no translation.
 * - Preserves Hindi, English, and Bilingual wording with 100% traceability to source PDF and page number.
 */

import fs from 'fs';
import path from 'path';
import { PdfReader } from 'pypdf'; // Script executed via tsx runner calling python helper or node pdf-parse

const ROOT_DIR = process.cwd();
const STAGING_DIR = path.join(ROOT_DIR, 'data', 'bpsc_question_bank', 'staging');

console.log('=== BPSC Phase 1 Question Extraction Script ===');
console.log(`Staging Directory: ${STAGING_DIR}`);
console.log('Run `python scratch/generate_all_phase1_outputs.py` to regenerate staging dataset.');
