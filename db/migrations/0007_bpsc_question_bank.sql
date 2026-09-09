-- 0007_bpsc_question_bank.sql
--
-- Phase 4A: Additive Migration for BPSC Historical Question Bank
-- Introduces normalized relational tables: bpsc_subjects, bpsc_topics, and bpsc_questions
--
-- Idempotent & non-breaking: Uses IF NOT EXISTS and RLS policies

-- 1. BPSC Subjects Table
CREATE TABLE IF NOT EXISTS bpsc_subjects (
  subject_id    TEXT PRIMARY KEY,                  -- e.g., 'BPSC-SUB-01'
  subject_name  TEXT NOT NULL UNIQUE,              -- e.g., 'History, Art & Culture'
  description   TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. BPSC Topics Table
CREATE TABLE IF NOT EXISTS bpsc_topics (
  topic_id      TEXT PRIMARY KEY,                  -- e.g., 'POLITY-001'
  subject_id    TEXT NOT NULL REFERENCES bpsc_subjects(subject_id) ON DELETE RESTRICT,
  topic_name    TEXT NOT NULL,
  description   TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. BPSC Questions Table
CREATE TABLE IF NOT EXISTS bpsc_questions (
  question_id               TEXT PRIMARY KEY,      -- e.g., 'BPSC-Q-000001'
  year                      INTEGER,
  exam_name                 TEXT NOT NULL,         -- e.g., '67th BPSC Mains'
  paper                     TEXT NOT NULL,         -- e.g., 'GS 1', 'GS 2', 'Essay'
  section                   TEXT,                  -- e.g., 'Section I'
  question_number           TEXT NOT NULL,         -- e.g., '1', 'Sub-a'
  marks                     NUMERIC,               -- e.g., 38, 8
  question_type             TEXT NOT NULL CHECK (question_type IN ('SHORT_ANSWER', 'LONG_ANSWER', 'ESSAY', 'DATA_INTERPRETATION', 'PRELIMS_MCQ', 'OTHER')),
  language                  TEXT NOT NULL DEFAULT 'English',
  original_question_text    TEXT NOT NULL,
  subject_id                TEXT NOT NULL REFERENCES bpsc_subjects(subject_id) ON DELETE RESTRICT,
  topic_id                  TEXT NOT NULL REFERENCES bpsc_topics(topic_id) ON DELETE RESTRICT,
  secondary_topic_id        TEXT REFERENCES bpsc_topics(topic_id) ON DELETE SET NULL,
  source_pdf_name           TEXT NOT NULL,
  source_page_number        INTEGER,
  classification_confidence NUMERIC DEFAULT 0.95,
  classification_method     TEXT DEFAULT 'two_pass_taxonomy_v1',
  classification_reason     TEXT,
  review_required           BOOLEAN NOT NULL DEFAULT FALSE,
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (Service role bypasses default deny)
ALTER TABLE bpsc_subjects  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpsc_topics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpsc_questions ENABLE ROW LEVEL SECURITY;

-- Indexes for performance on relational queries
CREATE INDEX IF NOT EXISTS idx_bpsc_questions_subject ON bpsc_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_bpsc_questions_topic   ON bpsc_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_bpsc_questions_year    ON bpsc_questions(year);
CREATE INDEX IF NOT EXISTS idx_bpsc_questions_paper   ON bpsc_questions(paper);
CREATE INDEX IF NOT EXISTS idx_bpsc_questions_qtype   ON bpsc_questions(question_type);
