# BPSC AI Answer Evaluator — Project Status

**This is the living record of what this app actually is and what state it's in.**
Read this first, before starting any work. If you change what the app does, you
update this file in the same session — see `CLAUDE.md` in the project root.

Last updated: 2026-09-07

---

## 1. What this application is

BPSC aspirants practise writing exam answers by hand. This app grades those
answers the way a subject professor would — a mark plus specific feedback on
what was missing — without a human examiner in the loop.

The student journey, end to end:

1. The student opens a **Telegram bot** (no app store, no signup form — their
   Telegram account *is* their account).
2. They get a practice question, write the answer **by hand on paper**, and
   photograph it.
3. The bot reads the handwriting (Hindi, English, or a mix) and shows the
   student the transcribed text to confirm or correct.
4. The confirmed text is graded against a pre-computed answer key and a scoring
   rubric, producing a mark plus written feedback.

The grading is deliberately split into stages that run at different times:

| Stage | When it runs | What it does |
|---|---|---|
| **Stage 0** | Once per question, *before* any student sees it | Generates a fresh question and its answer key (`expected_points`), grounded in NCERT content |
| **Stage A** | Once per submitted photo | Reads the handwriting into text, exactly as written |
| **Stage B** | Once per confirmed transcript | Compares the transcript against the Stage 0 answer key and scores it |

The reason for the split: deciding *what a correct answer contains* happens once
per question (Stage 0), not per student. By the time a student's answer is being
graded (Stage B), the model is only comparing against a fixed key — it never
gets to invent its own idea of the right answer mid-grading. That keeps marks
consistent between students answering the same question.

---

## 2. The stack, and where each part lives

| Piece | What it is | Where |
|---|---|---|
| **Telegram bot** | The entire student-facing interface | `src/bot.ts` |
| **Backend** | Node.js + TypeScript | `src/` |
| **Database** | Supabase (hosted Postgres), project `cdwthqbbhsywpyxyjmiw` | schema in `db/migrations/` |
| **Handwriting reader (Stage A)** | Google Gemini vision model | `src/stageA.ts` |
| **Question generator (Stage 0)** | Not built yet | — |
| **Grader (Stage B)** | Not built yet | — |
| **Hosting** | **Not deployed.** Runs locally on demand | see §5 |

### Every file in `src/`

| File | Responsibility |
|---|---|
| `bot.ts` | All Telegram conversation logic: `/start`, language choice, photo handling, confirm/edit buttons |
| `stageA.ts` | Sends a photo to Gemini and returns the transcript + a confidence score |
| `supabase.ts` | Database access — the only file that talks to Postgres |
| `config.ts` | Reads and validates environment variables (API keys, thresholds) |
| `text.ts` | Every user-facing message, in all three languages (Hindi / Hinglish / English) |
| `hash.ts` | SHA-256 hashing of photos |
| `index.ts` | Production entry point — an HTTP server for Telegram webhooks. **Written but not currently used** |
| `dev-polling.ts` | Local entry point — runs the bot without needing a public URL. **This is what actually runs today** |

### Which AI model does what, and why

- **Stage A (reading handwriting): Gemini flash-tier**, currently
  `gemini-3.7-flash`, set by `GEMINI_MODEL` in `.env`.
  Chosen after a Week 0 bake-off (see `../week0-ocr-test/`) that ran the same
  photo through several models: three independent Gemini flash models agreed on
  97–98% of the words when transcribing real handwritten Devanagari, and got
  every proper noun, date and Act name right. Flash-tier costs a fraction of
  pro-tier and this call runs on *every single submission*, so cost per call
  compounds fast — flash was both good enough and the economical choice.
- **Stage 0 and Stage B**: not built yet, model not yet chosen.

---

## 3. The database

Supabase Postgres. **Row Level Security is enabled on every table with zero
policies**, which means: nothing can read or write these tables except the
backend, which connects with the `service_role` key and bypasses RLS by design.
Verified — querying with the public `anon` key returns zero rows.

### Tables

| Table | What it's for | Populated? |
|---|---|---|
| `users` | One row per student, keyed on their Telegram ID | ✅ real rows |
| `questions` | The practice questions students answer | ⚠️ one placeholder row only |
| `model_answers` | The answer key for a question — `expected_points`, versioned | ❌ empty |
| `rubrics` | Scoring dimensions and their band descriptors, versioned | ❌ empty |
| `submissions` | One row per photographed answer: the transcript and its confidence | ✅ real rows |
| `evaluations` | One row per graded answer: scores, feedback, and which rubric/model/prompt produced them | ❌ empty |
| `payments` | Placeholder — real design deferred | ❌ empty, 3 columns only |
| `usage_ledger` | Placeholder — credit movements | ❌ empty, 4 columns only |

### How the tables relate

```
users
  └─< submissions >─ questions
         │              └─< model_answers   (answer key, versioned per question)
         └─< evaluations

rubrics          (standalone — versioned scoring rules, referenced by number not by foreign key)
payments         (→ users)
usage_ledger     (→ users)
```

Read `>─` as "many rows point at one": many submissions belong to one user, and
many submissions point at one question.

**Why `rubrics` and `model_answers` are versioned, and why `evaluations`
records version numbers rather than linking to them:** a mark given in March
must still be explainable in December, even after the rubric has been rewritten
twice. So every `evaluations` row stores a *snapshot* of which
`rubric_version`, `model_answer_version`, `model_name` and `prompt_version`
produced it. If those were live foreign keys instead, editing a rubric would
silently rewrite the meaning of every past score.

### Privacy: photos are never stored

The student's photo is downloaded into memory, hashed, sent to Gemini, and
discarded. Only `submissions.image_sha256` (a 64-character fingerprint) is
kept. There is no column anywhere for image data and nothing is written to
disk.

---

## 4. What's built vs. stubbed vs. missing

### ✅ Built and working

- Telegram bot responds to `/start`, creates the user row, asks for and stores
  language preference (Hindi / Hinglish / English).
- Student sends a photo → instant acknowledgement in their language → Gemini
  transcribes it → transcript saved to `submissions` with its confidence score
  and word count.
- Transcript is shown back with **Confirm** / **Edit** buttons. Edit shows the
  current text so it can be corrected in place, and refuses to silently replace
  a long answer with a short note without asking first.
- Transcripts render in a monospace block so tree/mind-map answers keep their
  alignment.
- Low-confidence photos (below `TRANSCRIPT_CONFIDENCE_THRESHOLD`, default 0.6)
  skip the confirm step entirely and ask for a re-shoot, rather than showing a
  garbled transcript to approve.
- Gemini calls retry with backoff on transient failures (503 overload, 429 rate
  limits), which happen routinely in practice.
- RLS enabled on all 8 tables and verified.

### ⚠️ Stubbed / placeholder

- **`questions.id = 00000000-0000-0000-0000-000000000001`** — a single fake
  question row exists purely so `submissions.question_id` has a valid target.
  Every submission so far points at it. Remove once Stage 0 generates real
  questions.
- **`payments` and `usage_ledger`** exist with minimal columns as placeholders.
  No credits are checked or charged anywhere; every student has unlimited free
  use right now.
- **`index.ts`** (the webhook server) is written and compiles but has never run
  — the bot currently runs via long-polling instead.

### ❌ Not built at all

- **Stage 0** — question generation and answer-key generation.
- **Stage B** — grading. Nothing has ever been scored.
- **Rubrics** — no scoring dimensions defined yet.
- **BPSC content ingestion** — the NCERT knowledge base, the 237-question
  pattern bank, the answer-structure templates and the marks-calibration data
  all still live as Word/CSV documents in `D:\Claude\Govt exam prep\BPSC\` and
  are not in the app.
- **Payments** (Razorpay), credit enforcement, referrals.
- **Deployment** — not on Railway or anywhere else.
- **Statistics / data-interpretation question type** — deliberately deferred,
  needs chart generation.

---

## 5. How to run it

Requires a `.env` file (copy `.env.example`). It is deliberately **not** in
version control — it holds the Telegram token, the Supabase `service_role` key
and the Gemini key.

```bash
npm install          # once
npm run dev:polling  # start the bot locally
```

`dev:polling` needs no public URL and no deployment. The bot stays live as long
as that terminal is open. `npm run dev` / `npm start` run the webhook server
instead, which is what a real deployment would use — untested so far.

Other commands: `npm run typecheck`, `npm run build`, `npm run migrate` (see
`db/migrations/README.md`).

---

## 6. Known constraints and risks

- **Gemini free-tier quotas are very tight** — roughly 20 requests per day per
  model. A single afternoon of testing exhausted three separate models. This
  cannot support real students; the Gemini account needs billing enabled
  (minimum $5 prepay) before launch.
- **The bot only runs while a terminal is open.** Nothing is deployed.
- **Edit-flow state is in memory**, so restarting the bot mid-edit loses the
  fact that a student was about to send a correction. They just re-send the
  photo.
- **Transcription preserves words far better than layout.** Week 0 measured
  ~97% agreement on *content* but only ~70–75% on *structure* for diagram-heavy
  answers. Stage B's structure check will need to account for this.
- **Node 20 is installed locally, but `@supabase/supabase-js` wants Node 22+.**
  Worked around with a `ws` WebSocket polyfill in `src/supabase.ts`.

---

## Changelog

Newest first. One entry per work session.

### 2026-09-07 — Project documentation and real migrations (Step 3, Parts 1–2)

- Created this file and `CLAUDE.md`, establishing that documentation and
  migrations are maintained going forward rather than reconstructed later.
- Replaced the ad-hoc `db/schema.sql` with numbered, version-controlled
  migrations in `db/migrations/`. `0001_baseline.sql` captures the schema
  exactly as it already existed in the live database, so replaying migrations
  from scratch reproduces the current state.
- Added a migration runner (`npm run migrate`) that applies pending migrations
  in order and records them in a `schema_migrations` table, so migrations are
  never applied twice and the live database's history is auditable.

### 2026-09-07 — Bot skeleton, database, and Stage A (Step 2)

- Created the Supabase project schema: all 8 tables, RLS enabled on every one
  before any other code was written, verified by confirming the public `anon`
  key can read nothing.
- Built the Telegram bot: `/start`, language selection, and the full
  photo → transcript → confirm/edit flow.
- Ported Stage A from the Week 0 OCR diagnostic — same prompt and same Gemini
  request shape that scored 97–98% content agreement in testing, so the
  production reader behaves like the one that was actually evaluated.
- Photos are hashed and discarded, never stored.
- Fixed during live testing: the Edit flow was silently overwriting a full
  answer with a short correction note (now asks first); the bot went silent on
  unrecognised messages (now always replies); transcripts lost their alignment
  in Telegram's proportional font (now sent as monospace); Gemini's routine 503
  and 429 responses crashed a submission instead of retrying.
- Pushed to GitHub: `cloudsandeep007/BPSC-AI-Answer-Evaluator`.

### 2026-09-07 — Week 0: can models read the handwriting at all?

- Built a throwaway diagnostic (`../week0-ocr-test/`) that sends one identical
  prompt to several vision models and lays the transcripts side by side.
- Tested on real handwritten Devanagari exam notes. Three independent Gemini
  flash models agreed on 97–98% of content words; every proper noun, date, Act
  and Article came back correct. Conclusion: the OCR premise holds, and the
  project is worth building.
- Also learned: models' *self-reported* confidence is useless as a quality
  signal (they all report 0.95+ regardless), so cross-model agreement was used
  instead. Layout fidelity is much weaker than word fidelity on diagrams.
