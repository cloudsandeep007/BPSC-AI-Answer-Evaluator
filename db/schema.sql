-- BPSC AI Answer Evaluator - initial schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).

create extension if not exists pgcrypto;

create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  telegram_id      bigint unique not null,
  phone            text,
  display_name     text,
  language         text check (language in ('hi', 'hinglish', 'en')),
  exam             text not null default 'BPSC',
  credits          integer not null default 0,
  plan_expires_at  timestamptz,
  referred_by      uuid references users(id),
  created_at       timestamptz not null default now()
);

create table if not exists questions (
  id           uuid primary key default gen_random_uuid(),
  exam         text not null,
  paper        text,
  subject      text,
  topic        text,
  question_hi  text,
  marks        integer,
  word_limit   integer,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists model_answers (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references questions(id),
  version          integer not null,
  model_answer_hi  text,
  expected_points  jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists rubrics (
  id          uuid primary key default gen_random_uuid(),
  exam        text not null,
  paper       text,
  version     integer not null,
  dimensions  jsonb,
  is_active   boolean not null default true
);

create table if not exists submissions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references users(id),
  question_id            uuid not null references questions(id),
  image_sha256           text not null,
  transcript             text,
  transcript_confidence  numeric,
  word_count             integer,
  created_at             timestamptz not null default now()
);

create table if not exists evaluations (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null references submissions(id),
  rubric_version        integer,
  model_answer_version  integer,
  model_name            text,
  prompt_version        text,
  dimension_scores      jsonb,
  points_found          jsonb,
  points_missed         jsonb,
  total_marks           numeric,
  feedback_hi           text,
  todo                  jsonb,
  flagged_for_human     boolean not null default false,
  latency_ms            integer,
  cost_paise            integer,
  created_at            timestamptz not null default now()
);

-- Placeholders per the brief: real design deferred to Week 6.
create table if not exists payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id),
  created_at  timestamptz not null default now()
);

create table if not exists usage_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id),
  credits_delta  integer,
  reason         text,
  created_at     timestamptz not null default now()
);

-- RLS on every table, no exceptions, before any other code runs.
alter table users          enable row level security;
alter table questions      enable row level security;
alter table model_answers  enable row level security;
alter table rubrics        enable row level security;
alter table submissions    enable row level security;
alter table evaluations    enable row level security;
alter table payments       enable row level security;
alter table usage_ledger   enable row level security;

-- No policies are created here on purpose. With RLS enabled and zero
-- policies, every role except service_role is denied by default -
-- service_role (used by the bot backend) bypasses RLS entirely. If a
-- future web dashboard or public API needs read access, add narrow
-- policies then; don't grant broad access speculatively now.

-- TEMPORARY placeholder question row (Stage 0 doesn't exist yet this
-- session). Every submission this session is filed under this fixed id so
-- the submissions.question_id foreign key has something real to point at.
-- Delete this row once Stage 0 starts generating real questions.
insert into questions (id, exam, paper, subject, topic, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  'BPSC', 'placeholder', 'placeholder', 'Week 2 placeholder - no real question yet',
  false
)
on conflict (id) do nothing;
