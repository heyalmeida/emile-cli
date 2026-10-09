---
name: clean-code
description: Baseline clean-code guidance for software changes — small pure functions, clear names, minimal surface.
keywords:
  - clean-code
  - refactoring
  - maintainability
  - readability
  - functions
---

# Clean code

Guidance for writing and changing code in any language. Apply proportionally —
match the existing style of each file.

- **Small, single-purpose functions.** A function does one thing; if it needs a
  paragraph to explain, split it. Keep branches shallow — guard clauses over
  nested conditionals.
- **Names carry the design.** Names state intent (`retryAfterAuthFailure`, not
  `doStuff2`); no abbreviations that only the author understands.
- **Prefer pure functions.** Push I/O and mutation to the edges; the core
  transforms inputs to outputs and stays trivially testable.
- **Errors are part of the API.** Fail loudly with specific messages at the
  boundary; never swallow errors silently, never leak stack traces or secrets
  to end-user output.
- **No dead code, no speculative abstraction.** Delete commented-out code.
  Extract a second call site before introducing a parameter, class or flag
  "for the future".
- **Comments explain constraints, not mechanics.** Say why the code cannot
  show (invariants, trade-offs, external contracts) — never narrate the
  obvious.
- **Small diffs.** Each change should be readable as one coherent intent;
  unrelated cleanups belong in a separate change.
- **Consistency beats preference.** The codebase's established conventions
  (formatting, naming, error handling, import order) win over personal taste.
