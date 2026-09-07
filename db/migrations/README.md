# Database migrations

The live database is defined entirely by the `.sql` files in this folder.
Replaying them in filename order, from an empty database, reproduces the
current schema exactly.

## Applying migrations

```bash
npm run migrate
```

Run it whenever new migration files have been added — after pulling changes, or
after a work session that added one. It applies only what hasn't run yet, in
order, and does nothing if the database is already current. Running it twice is
harmless.

It needs `SUPABASE_DB_URL` in `.env`. Find it at:
**Supabase dashboard → your project → Settings → Database → Connection string → URI.**
(This is different from the `SUPABASE_URL` / `service_role` key the app uses —
that pair talks to Supabase's API, while migrations need a direct Postgres
connection.)

## Adding a migration

- New file, next number, short description:
  `0002_add_ncert_knowledge.sql`, `0003_....sql`
- Never edit a migration that has already been applied. Its effect is already
  baked into the live database, and editing it makes the file history a lie.
  Write a new migration that changes what you need instead.
- Prefer idempotent statements (`create table if not exists`, `on conflict do
  nothing`) so a partially-applied state can recover.

## What's here

| File | What it does |
|---|---|
| `0001_baseline.sql` | The 8 original tables (`users`, `questions`, `model_answers`, `rubrics`, `submissions`, `evaluations`, and the `payments` / `usage_ledger` placeholders), RLS enabled on all of them, plus the temporary placeholder `questions` row. Captures the schema as it was first created by hand in the SQL Editor, before migrations existed. |

## Tracking

Applied migrations are recorded in a `schema_migrations` table created
automatically on first run. To see what's been applied:

```sql
select * from schema_migrations order by filename;
```
