# Rare Topic Surfacing Analysis

## Key Diagnostic Finding
- **Are rare topics permanently ignored?** **NO.**
- Low-frequency topics (e.g. `HIST-005` with 2 past questions) receive a baseline historical frequency score of **0.30** (rather than 0.0).
- During sequential practice, when higher-frequency topics accumulate repetition penalties, rare topics gracefully surface and get selected.
