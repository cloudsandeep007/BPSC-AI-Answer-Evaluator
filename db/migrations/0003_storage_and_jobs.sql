-- 0003_storage_and_jobs.sql
--
-- Adds image storage path and processing status to submissions,
-- and creates a durable jobs table to track asynchronous worker task state.
--
-- Idempotent: safe to run multiple times.
-- Apply with: npm run migrate

alter table submissions add column if not exists image_storage_path text;
alter table submissions add column if not exists status text default 'completed';

create table if not exists jobs (
  id           uuid primary key default gen_random_uuid(),
  queue_name   text not null,
  entity_id    text not null,
  status       text not null default 'pending', -- pending, processing, completed, failed
  payload      jsonb,
  error_message text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_queue_entity on jobs(queue_name, entity_id);
