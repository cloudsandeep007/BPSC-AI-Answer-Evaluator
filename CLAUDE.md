# Standing rules for this project

BPSC AI answer evaluator — a Telegram bot that grades handwritten exam answers.
The owner is not a programmer. These rules exist so the project stays
understandable to them, and to you, without either of us reconstructing it from
memory.

## 1. Read `docs/PROJECT_STATUS.md` before starting any work

It is the record of what already exists, what is deliberately stubbed, and what
was decided and why. Read it first so you don't rebuild or contradict something
that already works.

## 2. Keep `docs/PROJECT_STATUS.md` current, in the same session

Any change to the code or database that alters what the app does or how it is
structured means, before that session ends:

- add a dated changelog entry at the bottom (newest first, a few lines: what
  changed and **why**), and
- update every section of the document the change has made stale.

**An out-of-date `PROJECT_STATUS.md` is a bug, not a missing nicety.** Write it
in plain language a non-programmer can follow.

## 3. Never change the database by hand

No one-off SQL run directly against Supabase, no edits through the dashboard.
Every schema change — a table, a column, an index, a constraint, anything —
is a new numbered file in `db/migrations/`, applied with `npm run migrate`.

The live database must always be reproducible by replaying those files in
order. If it isn't, that's a defect to fix, not a shortcut to take.

See `db/migrations/README.md` for the conventions.
