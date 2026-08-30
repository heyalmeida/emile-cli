# Tasks: Context-aware history compression

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-context-aware-compression` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity,
  code quality/security, glossary, roadmap and ADR-0001). — *Rule 1*
- [x] T0.2 — Confirm this spec and plan are `approved` from the explicit user
  bug report and request to continue.
- [x] T0.3 — Classify risk as medium, map failure/security surfaces and define
  positive, negative and boundary gates.
- [x] T0.4 — Create/switch to `fix/context-aware-compression`. The branch uses
  the current integrated feature line because local `main` predates the model
  catalog and `agent/` module where the reported bug exists. — *Rule 8*

## Phase 1 — Implementation

- [x] T1.1 — Replace fixed paid/free character thresholds with the model-window
  token boundary and validated fallback estimate. *(AC-01, AC-02, AC-03)*
- [x] T1.2 — Integrate full-payload estimation before compression and refresh
  telemetry after it, including secondary system messages. *(AC-02, AC-03)*
- [x] T1.3 — Track post-compression history size and require >40% growth before
  another attempt. *(AC-04, AC-05)*
- [x] T1.4 — Add focused regression, boundary, failure and terminal-title tests.
  *(AC-01 through AC-05)*

> Commit as each coherent unit completes, staging ONLY this feature's files.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run the automated positive, negative, boundary and regression
  checks defined in the plan.
- [x] T2.2 — Run `node --check` on all touched JavaScript files and the
  `node bin/emile.js --verbose` smoke test; the smoke reached catalog/UI/MCP
  startup and then timed out at the pre-existing MCP connection boundary.
- [x] T2.3 — `npm audit` is not applicable because there is no dependency or
  lockfile change.
- [x] T2.4 — Verify all acceptance criteria one by one.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synchronize all documents required by Rule 2.
- [x] T3.2 — Update `features/model-system.md` and its index row under Rule 7.
- [x] T3.3 — Add the `[Unreleased]` changelog entry.
- [x] T3.4 — Revalidate touched Mermaid blocks and Markdown tables; all edited
  labels use quoted Mermaid syntax and `git diff --check` passes.
- [x] T3.5 — Update the spec status to `implemented`.
- [x] T3.6 — Commit documentation sync with explicit paths only.
- [x] T3.7 — Record limitations, non-executed checks and residual risk in the
  final handoff.

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `node test/compression.test.js`: 50k tokens with a 1,048,576-token window made zero completion calls. |
| AC-02 | ✅ | Same focused suite: threshold − 1 did not compress; `floor(limit × 0.8)` compressed. |
| AC-03 | ✅ | Same focused suite: >120k raw characters stayed below the 1M-model token boundary, and secondary system summaries were counted. |
| AC-04 | ✅ | Same focused suite: immediate retry below 40% growth was blocked; >40% growth allowed the second compression. |
| AC-05 | ✅ | Same focused suite: a throwing summarizer returned `false`; the unchanged history retried successfully. |

## Verification Evidence

| Command/check | Actual result |
|---------------|---------------|
| `node --check` on `compression.js`, `agent.js`, `session-stats.js` and both touched tests | Exit 0 for every file. |
| `node test/compression.test.js` | 7/7 focused tests passed. |
| `node --test test/*.test.js` | 3/3 current test files passed (`compression`, `rules`, `title`). |
| Cached model metadata inspection | `stealth/ox-alpha`: context 1,048,576; computed 80% gate 838,860. |
| `node bin/emile.js --verbose --help` | Exit 0; CLI bootstrap and option parsing passed. |
| `timeout 15s node bin/emile.js --verbose` | Exit 124 after catalog cache (417 models) and startup UI; blocked waiting for configured MCP servers, before the agent prompt. |
| Documentation/source validation | `git diff --check` passed; changed relative links exist; edited Mermaid labels/tables manually revalidated. |

No command execution, tool handler, workspace path, file-write, API-key or
session-export behavior changed. The remaining estimator risk is the documented
four-characters-per-token approximation and the absence of mid-tool-loop
compression.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `5c14fd5` | `docs(spec): define context-aware compression` | Initial spec, plan and tasks. |
| `fa446fa` | `docs(spec): count compressed system context` | Scope sync for secondary system-message accounting. |
| `2eb79d8` | `fix(agent): scale compression to model context` | Agent integration, compression gate, context math and tests. |
| `b580b35` | `docs(agent): register adaptive context policy` | Product/architecture/quality docs, feature registry, changelog and verification evidence. |
