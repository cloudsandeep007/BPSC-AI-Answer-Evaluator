---
trigger: always_on
---

# BPSC AI PLATFORM — STRICT CODE CHANGE & BACKWARD COMPATIBILITY RULES

These rules are MANDATORY for every AI coding agent working on this
repository.

============================================================
1. EXISTING FUNCTIONALITY MUST BE PRESERVED
============================================================

This is an EXISTING application.

The application already contains working features, business logic,
database structures, Telegram flows, AI behavior, and integrations.

UNDER NO CIRCUMSTANCES may an AI agent assume that an existing feature
is obsolete simply because a new architecture or specification suggests
a different implementation.

If an existing feature is present and working:

PRESERVE IT.

Do not remove it.
Do not disable it.
Do not replace it.
Do not simplify it.
Do not change its behavior.

unless the Product Owner explicitly approves the change.

============================================================
2. NO UNAUTHORIZED BREAKING CHANGES
============================================================

The AI agent MUST NOT make breaking changes to:

- existing features
- Telegram commands
- Telegram conversation flows
- user journeys
- database behavior
- database columns
- database relationships
- APIs
- AI evaluation behavior
- scoring/calibration logic
- existing prompts
- question generation
- OCR behavior
- payment behavior
- authentication
- authorization
- integrations

without explicit approval.

"Improvement" is NOT sufficient justification for a breaking change.

============================================================
3. DISCOVER BEFORE MODIFYING
============================================================

Before changing ANY existing code:

1. Find the relevant implementation.
2. Read the complete relevant file/module.
3. Find all callers/dependencies.
4. Determine existing behavior.
5. Determine whether users depend on it.
6. Check related database structures.
7. Check tests.
8. Check documentation.
9. Check Git history when the reason for existing behavior is unclear.

Only then may a change be proposed.

============================================================
4. IF SOMETHING ALREADY EXISTS, EXTEND IT
============================================================

If the required capability already exists:

DO NOT create a duplicate implementation.

Example:

If an AI service already exists:

DO NOT create another independent Gemini integration.

Instead:

- inspect the existing implementation
- preserve its behavior
- refactor safely if required
- extend it behind the approved architecture

The same rule applies to:

- database access
- authentication
- Telegram state
- question generation
- OCR
- evaluation
- RAG
- notifications
- logging
- configuration
- utilities

============================================================
5. ASK BEFORE REMOVING ANYTHING
============================================================

If you believe an existing feature, file, function, database column,
API, prompt, or integration should be removed:

DO NOT remove it immediately.

First report:

WHAT:
<what you want to remove>

WHY:
<technical reason>

CURRENT USAGE:
<where it is used>

RISK:
<what could break>

ALTERNATIVES:
<possible safer approaches>

RECOMMENDATION:
<your recommendation>

Then STOP and request Product Owner approval.

============================================================
6. ASK BEFORE CHANGING EXISTING BEHAVIOR
============================================================

If implementation of a new feature requires changing existing behavior:

STOP before making the change.

Explain:

CURRENT BEHAVIOR
NEW REQUIRED BEHAVIOR
WHY CHANGE IS REQUIRED
AFFECTED FEATURES
AFFECTED USERS
DATABASE IMPACT
API IMPACT
AI IMPACT
TELEGRAM IMPACT
REGRESSION RISK
ROLLBACK PLAN

Then ask for approval.

============================================================
7. DATABASE / MIGRATION RULES
============================================================

DATABASE CHANGES ARE HIGH RISK.

No AI agent may casually modify the database.

Every database change MUST use a migration.

Never:

- delete existing tables
- delete existing columns
- rename existing columns
- change column meaning
- change data types
- remove constraints
- change relationships
- drop indexes
- delete production data

without explicit Product Owner approval.

============================================================
8. MIGRATION VISIBILITY
============================================================

EVERY database change must be visible in the repository.

A migration must clearly show:

- migration filename
- date
- purpose
- affected tables
- affected columns
- indexes
- constraints
- data transformation
- compatibility considerations
- rollback/recovery considerations

Example:

db/migrations/0003_add_evaluation_blueprint.sql

Never make a database change manually and leave no migration record.

============================================================
9. NEVER HIDE DATABASE CHANGES
============================================================

If code requires a database modification:

DO NOT silently execute SQL against the database.

Create the migration first.

Document the migration.

Show the Product Owner what will change.

Only apply it when the project's approved database workflow permits it.

============================================================
10. PRODUCTION DATABASE PROTECTION
============================================================

NEVER:

- drop production tables
- truncate production tables
- delete production data
- overwrite production records
- run destructive migrations
- reset production database

without explicit human authorization.

If there is any uncertainty:

STOP.

ASK.

============================================================
11. BACKWARD COMPATIBLE MIGRATIONS
============================================================

Prefer:

ADD
before
REMOVE.

Prefer:

new column
→ populate
→ migrate application
→ verify
→ deprecate old column
→ remove only after approval.

Prefer backward-compatible database migrations.

Do not combine multiple destructive changes into one migration.

============================================================
12. MIGRATION REVIEW
============================================================

Before applying a migration, report:

Migration:
...

Tables affected:
...

Columns affected:
...

Data affected:
...

Existing users affected:
...

Existing features affected:
...

Risk:
LOW / MEDIUM / HIGH / CRITICAL

Rollback/recovery:
...

Approval required:
YES / NO

============================================================
13. CODE CHANGES MUST BE DOCUMENTED
============================================================

Every significant code change must be documented.

Documentation must explain:

WHAT changed
WHY it changed
HOW it works
WHAT existing behavior was preserved
WHAT new behavior was introduced
WHAT files changed
WHAT tests were added
WHAT risks exist

Do not rely on Git commit messages alone.

============================================================
14. CODE COMMENTS
============================================================

Add code comments when the reason for code is not obvious.

Comments should explain:

WHY

not merely:

WHAT

Bad:

// Set question ID

Good:

// Persist the active question so a Telegram process restart does not
// lose the student's in-progress session.

Do not fill the codebase with unnecessary comments.

============================================================
15. CHANGELOG REQUIREMENT
============================================================

Maintain:

docs/CHANGELOG.md

Every significant change must be recorded.

Each entry should contain:

## YYYY-MM-DD — Change Name

### Reason
...

### Business Impact
...

### Technical Changes
...

### Existing Features Preserved
...

### Database Changes
...

### AI Changes
...

### Tests
...

### Risks
...

### Status
...

============================================================
16. PROJECT STATUS REQUIREMENT
============================================================

Maintain:

docs/PROJECT_STATUS.md

After every major implementation phase, update:

- completed features
- current architecture
- database state
- AI state
- testing state
- known issues
- next phase
- last verification date

============================================================
17. DECISION RECORD
============================================================

For significant architectural or business decisions, create an ADR.

Location:

docs/architecture/ADR/

Record:

- problem
- options
- decision
- reason
- consequences
- date

============================================================
18. FEATURE REGRESSION PROTECTION
============================================================

Before changing existing functionality:

CREATE OR VERIFY A TEST.

The test must prove that the existing behavior remains intact.

After implementation:

RUN THE TEST.

If the test fails:

DO NOT simply modify the test to match the new behavior.

Investigate the regression.

============================================================
19. AI / PROMPT PROTECTION
============================================================

Existing AI prompts and evaluation logic are business-critical.

Do not casually change:

- prompts
- scoring
- rubric
- calibration
- model parameters
- temperature
- token limits
- evaluation criteria
- OCR instructions
- question-generation instructions

If a change is required:

document:

OLD
NEW
REASON
EXPECTED IMPACT
TEST RESULT

============================================================
20. CALIBRATION PROTECTION
============================================================

Existing BPSC calibration examples are REGRESSION BASELINES.

Never modify calibration examples or expected results merely to make
new code pass.

If calibration changes:

STOP.

Explain why the baseline should change.

Request Product Owner approval.

============================================================
21. TELEGRAM PROTECTION
============================================================

Existing Telegram user flows are production functionality.

Do not change:

- commands
- buttons
- callback behavior
- state transitions
- message sequence
- answer submission
- multi-page handling

without checking existing behavior.

If a new architecture requires a change:

preserve the user-visible behavior wherever possible.

============================================================
22. NO DUPLICATE FEATURES
============================================================

Before creating a new feature/module/service:

SEARCH THE ENTIRE REPOSITORY.

If something similar already exists:

reuse or extend it.

Do not create duplicate:

- services
- utilities
- AI clients
- database repositories
- prompts
- handlers
- configuration
- validation
- storage logic

============================================================
23. NO UNNECESSARY REFACTORING
============================================================

Do not refactor unrelated code while implementing a feature.

Example:

Task:
Add persistent session state.

DO NOT ALSO:

- rewrite Telegram handlers
- change AI prompts
- change database ORM
- upgrade every dependency
- redesign unrelated modules

Keep changes focused.

============================================================
24. NO UNNECESSARY DEPENDENCY CHANGES
============================================================

Do not upgrade, downgrade, replace, or remove dependencies unless
required for the current task.

If dependency change is required:

document:

- package
- current version
- new version
- reason
- compatibility risk
- tests

============================================================
25. NO BLIND FILE DELETION
============================================================

Never delete a file because:

"it appears unused."

First verify:

- imports
- dynamic imports
- scripts
- deployment references
- database us