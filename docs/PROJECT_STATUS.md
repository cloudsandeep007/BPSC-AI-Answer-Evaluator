# BPSC AI Answer Evaluator — Project Status

**This is the living record of what this app actually is and what state it's in.**
Read this first, before starting any work. If you change what the app does, you
update this file in the same session — see `CLAUDE.md` in the project root.

Last updated: 2026-09-08

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
| **Question generator (Stage 0)** | Google Gemini | `src/stage0.ts` |
| **Grader (Stage B)** | Google Gemini + scoring arithmetic in code | `src/stageB.ts`, `src/content/calibration.ts` |
| **BPSC content** | Ingested from the source documents | `src/content/` |
| **PDF report cards** | PDFKit, rendered in a bundled Devanagari font | `src/reportCard.ts`, `assets/fonts/` |
| **Hosting** | **Not deployed.** Runs locally on demand | see §5 |

### Every file in `src/`

| File | Responsibility |
|---|---|
| `bot.ts` | All Telegram conversation logic: `/start`, language choice, photo handling, confirm/edit buttons |
| `stageA.ts` | Sends a photo to Gemini and returns the transcript + a confidence score |
| `stage0.ts` | Generates a fresh question and its answer key, then activates it |
| `stageB.ts` | Grades a confirmed transcript against that answer key |
| `gemini.ts` | Shared Gemini client - retries, JSON extraction, usage accounting |
| `content/` | The ingested BPSC exam content (see §3a) |
| `citation.ts` | Shared `Citation` type - every point (Stage 0's answer keys, Stage B's judged points) carries a real, checkable source, never a bare "NCERT" or "general knowledge" label |
| `reportCard.ts` | Builds the PDF report card sent after grading |
| `seed.ts` | Writes reference rows (the rubric) into existing tables |
| `migrate.ts` | Applies pending database migrations |
| `supabase.ts` | Database access — the only file that talks to Postgres |
| `config.ts` | Reads and validates environment variables (API keys, thresholds) |
| `text.ts` | Every user-facing message, in all three languages (Hindi / Hinglish / English) |
| `hash.ts` | SHA-256 hashing of photos |
| `ai/gateway.ts` | Central AI Gateway abstraction - routes model calls, tracks tokens & latency, manages mock provider |
| `ai/providers/geminiProvider.ts` | Google Gemini REST adapter with exponential backoff and JSON extraction |
| `storage/supabaseStorage.ts` | Uploads original student answer sheets to Supabase Storage bucket and creates signed URLs |
| `queue/queueManager.ts` | BullMQ queue scheduler with seamless inline fallback for local dev when Redis is absent |
| `worker.ts` | Standalone BullMQ background worker listening on evaluation-queue |
| `index.ts` | Production entry point — an HTTP server for Telegram webhooks with secret token validation |
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
- **Stage 0 (generating questions and answer keys)** and **Stage B (judging)**:
  the same Gemini model by default, overridable per stage with
  `GEMINI_GENERATION_MODEL` and `GEMINI_JUDGE_MODEL`. Split them if judging
  ever needs a stronger model than generation.

**Stage B never reports a mark.** It returns band labels per dimension; the
final number is computed by our own code in `src/content/calibration.ts`. A
model asked for a score anchors on plausible-looking numbers, whereas the
arithmetic is auditable and testable — and it is tested, against the source
document's own worked examples (`npm run verify:calibration`).

**Both stages reason like a subject professor, not a template-filler.**
Stage 0's prompt explicitly orders the reasoning: NCERT first, the model's
own subject knowledge second, live web search third for topics where
current developments actually matter. Stage B's stored `expected_points`
list is a consistency guide, not a ceiling — a correct, current, or validly
argued point beyond the list is still credited, with its own citation.

**Live search grounding** (`tools: [{ google_search: {} }]`) is wired into
both stages, but only for `Current Affairs` and `Science & Technology`
topics (`src/stage0.ts`, `needsCurrentInfo()`) — a fixed list rather than a
per-question classifier call, which would add a second Gemini round-trip to
every question. This uses the same Gemini API key already in `.env`; no new
service was needed. Verified against Google's current docs that grounding
combines with the JSON structured-output mode this app depends on (a
Gemini-3+-only capability).

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
| `questions` | The practice questions students answer | ✅ real generated rows |
| `model_answers` | The answer key for a question — `expected_points`, versioned | ✅ one per generated question |
| `rubrics` | Scoring dimensions and their band descriptors, versioned | ✅ v1 seeded |
| `submissions` | One row per photographed answer: the transcript and its confidence | ✅ real rows |
| `evaluations` | One row per graded answer: scores, feedback, and which rubric/model/prompt produced them | ✅ written by Stage B |
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

## 3a. The ingested BPSC content

The exam content originated as Word and CSV documents in
`D:\Claude\Govt exam prep\BPSC\`. It is **not** read from there at runtime —
`npm run ingest:content` converts those documents into the files below, which
are committed. The script is the record of exactly how each file was derived,
so none of this is hand-typed guesswork.

| File | From | What it holds |
|---|---|---|
| `src/content/question-patterns.json` | `BPSC-Question-Bank.csv` | All 237 past questions plus the distributions Stage 0 samples from: topic-by-paper, directive-by-topic |
| `src/content/ncert-knowledge.json` | `NCERT Knowledge Base - BPSC Priority Subjects.docx` | 13 NCERT-sourced fact entries, tagged by topic, plus the document's own note on what it doesn't cover |
| `src/content/answerTemplates.ts` | `BPSC - Standard Answer Structure and Judging Rules.docx` | The four answer templates: marks, word ranges, expected structure |
| `src/content/calibration.ts` | `BPSC - Answer Evaluation and Model-Answer Standard.docx` | Dimension weights, band values, and the realism ceilings |
| `src/content/rubric.ts` | Both rules documents | The band descriptors the judging model reads. Seeded into the `rubrics` table by `npm run seed` |

**Why some of it is JSON and some is TypeScript:** the question bank and NCERT
facts are *data* Stage 0 looks things up in, so they are data files. The
templates, weights and ceilings are *arithmetic the backend performs* — the
numbers and the code applying them have to change together, so they live in
code where a change is a reviewed commit rather than an editable row.

**The 237 historical questions are style data, never served to students.**
Stage 0 shows a handful to the model as examples of house style, then checks
its generated question against every historical question on that topic and
rejects anything scoring above 0.6 word-overlap similarity — a deterministic
backstop rather than trusting the instruction not to copy.

**NCERT coverage is partial and honestly labelled.** It reaches Polity (8
entries), Geography & Economics (3) and History & Culture (2). Current
Affairs, Science & Technology and most of Geography are not covered, so every
`expected_points` entry records whether it came from `ncert` or
`general_knowledge`.

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
- **`/question`** serves a question, generating one via Stage 0 if none is live.
- **Stage 0** picks a paper/topic/directive weighted by the real exam's
  distribution, generates an original question (rejecting anything too close to
  a historical one), builds its `expected_points` answer key NCERT-first, and
  only then marks the question active — a live question with no key would be
  ungradeable.
- **Stage B** runs when a student confirms (or edits) their transcript: fetches
  the active rubric and the question's answer key, asks the model to *compare
  only*, computes the mark in our own code, writes an `evaluations` row
  carrying all four provenance fields, and sends the student their score with
  points found, points missed and what to do next.
- Scoring calibration is verified against the source document's own worked
  examples — `npm run verify:calibration` reproduces every documented mark.
- **Every point in an answer key and every judged point carries a real
  citation** — NCERT points cite the actual book/class/chapter, general-
  knowledge points name the specific report/ministry/scheme relied on, and
  web-grounded points carry a real URL from Gemini's own search grounding.
  Verified live: `npm run smoke:stages` checks no point's citation is a bare
  "NCERT" or "general knowledge" label.
- **A PDF report card** is generated per evaluation and sent via Telegram
  right after the text summary: question context, score and per-dimension
  breakdown, points found/missed with citations, a professor's note, and a
  score-trend sparkline when the student has prior evaluations on the same
  subject. Renders in a bundled Devanagari font since most content is Hindi
  and PDFKit's built-in fonts are Latin-only - verified against real Hindi
  content, not just isolated glyph tests.

### ⚠️ Stubbed / placeholder

- **`questions.id = 00000000-0000-0000-0000-000000000001`** — the bookkeeping
  placeholder. Submissions only land on it when a student photographs an answer
  without ever asking for a question; those cannot be graded and the bot says
  so. Real submissions now point at real generated questions.
- **Which question a student is answering is now persisted in the database** via
  `users.active_question_id` and `users.edit_state` (added in migration
  `0002_user_session_state.sql`), eliminating in-memory session loss across
  restarts.
- **Cost per evaluation is not recorded** — `evaluations.cost_paise` is written
  as null. Token counts are available from the Gemini response but are not yet
  converted to money.
- **`payments` and `usage_ledger`** exist with minimal columns as placeholders.
  No credits are checked or charged anywhere; every student has unlimited free
  use right now.
- **`index.ts`** (the webhook server) is written and compiles but has never run
  — the bot currently runs via long-polling instead.

### ❌ Not built at all

- **Statistics / data-interpretation questions** — Template 4 exists in
  `answerTemplates.ts` but is marked unsupported and excluded from Stage 0's
  sampling. It needs chart generation, which neither stage handles.
- **Migrations have never actually been run** — the runner is written and
  fails helpfully, but `SUPABASE_DB_URL` is not set, so `npm run migrate` has
  not been executed against the live database. Everything so far has needed
  only row inserts, which go through the API.
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

Other commands:

| Command | What it does | When to run it |
|---|---|---|
| `npm run migrate` | Applies pending database migrations | After any session that added a migration file |
| `npm run seed` | Writes the rubric into the `rubrics` table | After changing `src/content/rubric.ts` |
| `npm run ingest:content` | Rebuilds `src/content/*.json` from the source Word/CSV documents | When those documents change |
| `npm run verify:calibration` | Checks the scoring maths against the source document's worked examples | After touching `calibration.ts` |
| `npm run smoke:stages` | Runs Stage 0 then Stage B end to end against the live database, and writes a real PDF from the result | To check the pipeline works; costs a few Gemini calls |
| `npm run preview:report-card` | Renders the PDF from fixed sample data, no DB or Gemini calls | To check layout changes quickly |
| `npm run typecheck` / `npm run build` | TypeScript checks | Anytime |

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

### 2026-09-08 — Phase 2 Asynchronous Processing & Supabase Storage for Answer Images

- Added Supabase Storage adapter (`src/storage/supabaseStorage.ts`) to upload student
  handwritten answer sheet image buffers to a private `answer-sheets` bucket, preserving
  original artifacts for human audits and presentation evaluations.
- Added migration `0003_storage_and_jobs.sql` adding `image_storage_path` and `status`
  to `submissions`, and creating a durable `jobs` table to mirror BullMQ queue states.
- Implemented queue manager (`src/queue/queueManager.ts`) using BullMQ and Redis with an
  automatic inline asynchronous fallback when `REDIS_URL` is not set, ensuring local
  developers without Redis are never blocked.
- Added standalone worker entry point (`src/worker.ts`) to run decoupled evaluation
  workers in background processes.
- Refactored `src/bot.ts` to asynchronously upload image buffers to Supabase Storage and
  route answer grading via `queueManager`.
- Added unit tests in `tests/unit/storage.test.ts` and `tests/unit/queue.test.ts`.

### 2026-09-08 — Phase 0 Audit & Phase 1 Architecture Decoupling & AI Gateway

- Conducted exhaustive repository discovery and architecture gap analysis against
  all 12 authoritative specification documents; produced `docs/00-REPOSITORY-AUDIT.md`,
  `docs/00-gap-analysis.json`, and `docs/00-implementation-plan.md`.
- Set up automated unit test suite with `vitest`, compatible with local Node 20.10.
  Added unit tests in `tests/unit/calibration.test.ts` reproducing the 6 official
  examiner worked examples with 100% agreement.
- Secured the Telegram webhook endpoint in `src/index.ts` with
  `X-Telegram-Bot-Api-Secret-Token` header validation against `config.telegramWebhookSecret`.
- Eliminated fragile in-memory session maps (`currentQuestion`, `awaitingEdit`,
  `pendingReplacement`) in `src/bot.ts`. Added migration `0002_user_session_state.sql`
  adding `active_question_id` and `edit_state` directly to `users` table so bot
  restarts never lose active student question sessions.
- Created internal AI Gateway abstraction (`src/ai/gateway.ts`) with provider routing,
  token accounting, latency measurement, and an offline deterministic mock provider
  (`src/ai/providers/mockProvider.ts`) for fast, zero-cost CI/CD testing.
- Refactored `src/stageA.ts`, `src/stage0.ts`, and `src/stageB.ts` to route all
  model calls through `aiGateway`.

### 2026-09-07 — BPSC content ingested, Stage 0 and Stage B built (Step 3, Parts 3–4)

- Ingested the four BPSC source documents into `src/content/` via a repeatable
  script (`npm run ingest:content`) rather than hand-typing: 237 past questions
  with their topic/directive distributions, 13 NCERT fact entries, the four
  answer templates, and the marks-calibration data. See §3a for the split
  between JSON data and TypeScript config, and why.
- Seeded rubric v1 into the `rubrics` table. It went in as a row rather than a
  migration because the table already existed — data, not schema.
- **Stage 0** generates a question and its answer key. It samples paper, topic
  and directive from the real exam's distribution, and rejects any generated
  question scoring above 0.6 similarity against a historical one — the question
  bank is style data and must never be served back verbatim, so that is
  enforced in code rather than left to a prompt instruction.
- **Stage B** grades a confirmed transcript. The model is given the fixed answer
  key and told to compare only; it returns band labels, never a number. The mark
  is computed by our own code so it is auditable.
- **Calibrated against real BPSC examiner behaviour**, which is the point of the
  whole exercise: topper copies show ~45–55% on discursive answers, not 85%+.
  `npm run verify:calibration` checks the arithmetic against the six worked
  examples in the source document and all six now reproduce. A flawless
  discursive answer lands at 68% — the top of the documented band — rather than
  the 90%+ a naive rubric would award.
- Added `/question` to serve a question. Without it Stage B had nothing
  meaningful to grade against, since students were photographing answers to
  questions the app had never asked.
- Verified end to end with `npm run smoke:stages`: Stage 0 produced a
  Bihar-focused agro-industry question keyed to the ingested NCERT chapters;
  Stage B scored a vague answer 0.5/8 and a content-complete but badly
  structured one 6/8, docking it on structure alone. All four provenance fields
  recorded on both evaluations.

### 2026-09-08 — Professor-grade judging with citations, and a PDF report card (Step 4)

- **Confirmed the "Model Answers - Starter Batch" document is not, and never
  was, read by any code** - it exists on disk purely as illustrative
  reference. Nothing to remove; recorded here so it's not re-checked next
  session.
- **Rewrote Stage 0's and Stage B's prompts** so the model reasons like a
  subject professor deciding what an ideal answer requires, in an explicit
  order - NCERT first, own subject knowledge second, live web search third
  for topics where being current actually matters - rather than filling a
  template or matching against one stored example.
- **Wired live search grounding** (`tools: [{ google_search: {} }]`) into
  both stages for `Current Affairs` and `Science & Technology` topics, using
  the Gemini key already configured - no new service needed. A fixed topic
  list rather than a per-question classifier, to avoid a second Gemini call
  on every question; revisit if finer judgement turns out to be worth that
  cost.
- **Every point now carries a real citation** (`src/citation.ts`), not a bare
  "ncert"/"general_knowledge" tag: NCERT points cite book, class and chapter
  (backfilled into `ncert-knowledge.json` by re-running
  `npm run ingest:content`); general-knowledge points name a specific report,
  ministry or scheme; web-grounded points carry a real URL from Gemini's own
  search results.
- **Stage B's stored checklist is now a consistency guide, not a ceiling** -
  a correct, current, or validly argued point beyond it is still credited.
  Points the model claims a student made or missed reference the stored key
  by index rather than restating a citation from memory, so what's shown to
  the student is always exactly what Stage 0 assigned, never a paraphrase
  that could drift.
- **Built the PDF report card** (`src/reportCard.ts`, PDFKit) sent via
  Telegram right after the text summary. Chose PDFKit over a headless-Chrome
  approach specifically because this app already runs on a small Railway
  container that's had real friction (Node version, a socket-binding bug) -
  a ~300MB Chromium binary for a data-driven document isn't worth the cost.
  Bundled a Devanagari font (`assets/fonts/`, static-instanced from Google's
  variable Noto Sans Devanagari via `fonttools`) since most content is Hindi
  and PDFKit's built-in fonts can't render it at all - verified with real
  mixed Hindi/English content, not just isolated glyphs.
- **Generation is synchronous** - PDFKit builds the document from data in
  tens of milliseconds, noise next to the Gemini call that already ran, so
  the sync-vs-background tradeoff doesn't bite at this scale.
- Caught and fixed two real layout bugs by actually looking at the rendered
  output rather than trusting a clean typecheck: a footer placed inside the
  bottom margin was triggering PDFKit's automatic page-insertion, ballooning
  a 2-page report to 6; and section headings could be stranded alone at the
  bottom of a page with their content pushed to the next. Fixed the second
  one generally - headings and their first content block are now reserved as
  one atomic unit, not checked for page-space separately.
- Verified end to end with `npm run smoke:stages` against live Gemini and
  Supabase, unscripted: generated a 100-mark Bihar rural-economy essay
  question with 8 real-citation answer-key points, graded a vague answer at
  3/100 and a content-complete one at 52.5/100 (docked specifically for an
  undifferentiated wall of text, since essays weight structure at 30%), and
  produced a genuine 2-page PDF from that live result - not a hand-crafted
  fixture.

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
