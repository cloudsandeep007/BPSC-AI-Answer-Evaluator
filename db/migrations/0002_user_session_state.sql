-- 0002_user_session_state.sql
--
-- Persists Telegram user session state (active question and in-progress edit state)
-- directly in the users table so server restarts / container deploys never drop
-- an in-flight student session.
--
-- Idempotent: safe to run multiple times.
-- Apply with: npm run migrate

alter table users add column if not exists active_question_id uuid references questions(id);
alter table users add column if not exists edit_state jsonb;

comment on column users.active_question_id is 'The question the student is currently answering or recently received';
comment on column users.edit_state is 'Ephemeral edit state when student taps Edit on transcript (submissionId, originalTranscript, wordCount)';
