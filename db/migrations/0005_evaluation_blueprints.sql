create table if not exists evaluation_blueprints (
  id uuid primary key,
  question_id uuid not null references questions(id),
  topic text not null,
  paper text not null,
  slot_type text not null,
  marks real not null,
  word_limit integer not null,
  directive text not null,
  introduction_must_cover text not null,
  dimensions_json text not null,
  conclusion_must_cover text not null,
  minimum_specifics_json text not null,
  common_mistakes_to_penalise_json text not null,
  created_at timestamp with time zone default now() not null
);

-- Note: In Supabase/PostgreSQL, adding a column is non-breaking.
alter table evaluations add column if not exists blueprint_id uuid references evaluation_blueprints(id);
