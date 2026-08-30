# Emile — Roadmap

> **Status:** 🟢 Current · Phases, deliverables and success criteria.
> This document translates "becoming a serious project" into concrete phases. Priority: top to bottom within each phase.

---

## Phase 0 — Engineering Foundation ✅ (delivered)

Goal: install the Software Engineering concepts that govern the project.

- [x] `.clinerules` (mandatory AI rules, single source with `AGENTS.md` symlink, including the feature-branch Git workflow)
- [x] SDD: `specs/` with README, templates and lifecycle
- [x] `features/`: feature catalog with template and index
- [x] `docs/`: PRD, architecture, visual identity (TUI design system), code quality/security, glossary, roadmap — in English (open source)
- [x] ADR-0001 (tech stack) + `CHANGELOG.md` + `CONTRIBUTING.md`
- [x] Retroactive registry of existing features in `features/` (agent loop, tools, MCP, skills, plans mode, sessions, compression, UI and quality gates)
- [x] Branch topology normalized: `development` is the integration parent, active branches use stable product-domain names, and legacy refs are archived under `archive/legacy/`
- [x] Dedicated `docs/documentation` branch created for documentation-only commits, separate from product-code branches

**Success criterion:** every future change is born from a spec and ends with synced docs + CHANGELOG, on a feature branch with scoped commits.

---

## Phase 1 — UI Overhaul ✅ (passes 1-4 + dynamic-title follow-up delivered)

Goal: turn the TUI from "functional" into a reference for terminal UX. Specs: `2026-08-25-tui-overhaul` (pass 1), `2026-08-25-tui-premium` (pass 2), `2026-08-25-tui-open-boxes` (pass 3), `2026-08-25-prompt-multiline-fix` (pass 4) and `2026-08-25-dynamic-terminal-title` (follow-up).

- [x] Review and approve the UI overhaul spec (Pass 1: spacing, rhythm and readability)
- [x] Consolidate the palette: remove legacy `pc.*` remappings; all output via `C.*`
- [x] Visual hierarchy of blocks (reply × tool output × reasoning × metadata) — grid-aligned tool lines, ghost thinking, rhythm gaps
- [x] Suppress status noise: silent spinner stop + single dim `↳ N tools` header
- [x] Premium pass 2 + open boxes pass 3: command divider, ghost collapsed thinking, open boxes (no side borders), white top-border fix
- [x] Pass 4: prompt multiline rendering fixed (explicit per-row writes, clamped cursor column); response box measure raised to `MAX_BOX_W = 120`
- [x] Dynamic terminal title: sanitized activity-first states for startup, waiting, thinking, responding, compression and tool execution
- [ ] Dedicated visual treatment for error states (API, model fallback, MCP) — deferred (follow-up pass)
- [ ] `/cost` and stats in the UI's box pattern — deferred (follow-up pass)
- [ ] Narrow-width audit (<80 cols) of every component — passes 1-4 blocks verified; full audit pending
- [x] Register the `terminal-ui` feature in `features/`

**Success criterion:** the visual review checklist (`docs/visual-identity.md` § 6) passes on subsequent changes without flagging new debt.

---

## Phase 1.5 — Model System ✅ (delivered)

Delivered in `specs/2026-08-25-model-system`, `specs/2026-08-25-dynamic-model-catalog` and `specs/2026-08-25-context-aware-compression`: single/live model metadata, capability-gated reasoning effort, honest context tracking (`~` estimate prefix), cache-stable conversation prefix + cache-hit visibility, model-window-aware compression, and IMPROVEMENTS § 1.2 (stream errors), § 1.3 (Retry-After), § 3.2 (model table), § 3.4 (readFile cap).

**Success criterion:** the visual review checklist (`docs/visual-identity.md` § 6) passes on subsequent changes without flagging new debt.

---

## Phase 2 — Automated Quality

Goal: replace manual scripts with executable gates.

> Several items in this phase and Phase 3 are detailed with code analysis and a suggested execution order in [`IMPROVEMENTS.md`](IMPROVEMENTS.md).

- [x] Test suite (Node test runner): critical tools, API, history, skills, UI and agent-policy modules — detailed prioritization in [`IMPROVEMENTS.md` § 3.1](IMPROVEMENTS.md#31-zero-automated-tests)
- [x] Top-priority robustness fixes from [`IMPROVEMENTS.md`](IMPROVEMENTS.md): retry honoring `Retry-After`, visible stream errors, ambiguous `editFile` rejection and provider-aware model validation — delivered across the model/security specs
- [x] `npm test` as a mandatory gate in every spec
- [x] Lint (ESLint) + `npm run lint` as a gate
- [x] CI on GitHub Actions: check + lint + test on pull requests
- [x] ADR documenting the test runner/lint choice

**Success criterion:** RF-15 of the [PRD](product.md) met; `tasks.md` stops depending on manual scripts for covered modules.

---

## Phase 3 — Agent Robustness

Goal: reliability in real-world scenarios.

- [x] Structured API error handling (retry with backoff, explicit timeout and actionable classification) — delivered in `specs/2026-08-30-error-ux`
- [x] Context policy: history compression at 80% of the active model window, with full-payload estimation and >40% growth hysteresis — delivered in `specs/2026-08-25-context-aware-compression`
- [x] `readFile` cap for paid models (`IMPROVEMENTS.md` § 3.4) — delivered in `specs/2026-08-25-model-system`
- [x] Multi-level `/undo` (with an undo-stack limit — `IMPROVEMENTS.md` § 1.5)
- [x] Single model table (`src/models.js`) replacing hardcoded prices/context (`IMPROVEMENTS.md` § 3.2) — delivered in `specs/2026-08-25-model-system`
- [ ] Guaranteed graceful shutdown (MCP, readline, session) on every exit path
- [ ] Formal security audit of the tool handlers (full threat model, including `IMPROVEMENTS.md` § 2: `0600` permissions on the key file and expanded whitelist)

**Success criterion:** zero unhandled crashes on a battery of common coding tasks.

---

## Phase 4 — Distribution

Goal: installation with one command.

- [ ] Publish to npm (`npx emile`)
- [ ] Semantic versioning with releases
- [ ] `--version`, migration notes and support policy

---

## Backlog (no phase yet)

- Global/shared config installation across workspaces
- Additional MCP transport (SSE/HTTP)
- New providers on demand
