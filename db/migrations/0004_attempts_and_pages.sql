-- 0004_attempts_and_pages.sql
--
-- Introduces multi-page answer attempts and individual attempt pages,
-- allowing students to upload multi-page handwritten answers (for 36-38 mark questions).
--
-- Idempotent: safe to run multiple times.
-- Apply with: npm run migrate

create table if not exists attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  question_id  uuid not null references questions(id),
  status       text not null default 'draft', -- draft, completed, cancelled
  total_pages  integer not null default 0,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists attempt_pages (
  id                 uuid primary key default gen_random_uuid(),
  attempt_id         uuid not null references attempts(id) on delete cascade,
  page_number        integer not null,
  image_sha256       text not null,
  image_storage_path text,
  transcript         text,
  confidence         numeric,
  word_count         integer default 0,
  created_at         timestamptz not null default now()
);

alter table submissions add column if not exists attempt_id uuid references attempts(id);

create index if not exists idx_attempts_user on attempts(user_id);
create index if not exists idx_attempts_question on attempts(question_id);
create index if not exists idx_attempt_pages_attempt on attempt_pages(attempt_id, page_number);
