# Tasks: Enhanced web search with Tavily and Firecrawl

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-enhanced-web-search` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, security, glossary, roadmap and ADRs) — *Rule 1 of `.clinerules`*
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify the change as high risk and record URL, DNS, secrets, prompt-injection, cost and multimodal gates
- [ ] T0.4 — Synchronize and switch to `feat/agent-loop` for product implementation — *Rule 8 of `.clinerules`*

## Phase 1 — Implementation

- [ ] T1.1 — Add backward-compatible enhanced-provider configuration and masked `/tavily`/`/firecrawl` setup/state commands *(verifies AC-02, AC-03, AC-08)*
- [ ] T1.2 — Add the parent enhanced-web tool composer while preserving the native OpenRouter schema *(verifies AC-01, AC-02, AC-03)*
- [ ] T1.3 — Implement public-URL/DNS validation, truncation and secret-safe errors *(verifies AC-06, AC-07)*
- [ ] T1.4 — Implement bounded Tavily discovery without implicit scraping *(verifies AC-04)*
- [ ] T1.5 — Implement Firecrawl rendered Markdown and screenshot normalization *(verifies AC-05, AC-07)*
- [ ] T1.6 — Integrate tool execution, vision gating, multimodal attachments and untrusted-content instructions in the agent loop *(verifies AC-05, AC-09, AC-10)*
- [ ] T1.7 — Update CLI suggestions/help and compact provider status rendering *(verifies AC-02, AC-08)*

> Commit each coherent unit separately, staging ONLY this feature's files.

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run positive, negative and boundary unit tests for commands, URL/DNS security, providers, tool composition and multimodal results
- [ ] T2.2 — Run `node --check` on all touched files, `npm test`, `npm run lint`, `git diff --check` and the CLI smoke test
- [ ] T2.3 — Confirm no dependency was added; otherwise run and triage `npm audit`
- [ ] T2.4 — Manually verify 60/80/120-column UI, Esc/Ctrl+C handling, ANSI leakage and secret-free output
- [ ] T2.5 — Verify every acceptance criterion and record evidence below

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Sync README, PRD, architecture, visual identity, security, glossary and roadmap as applicable
- [ ] T3.2 — Create/update the feature registry and index
- [ ] T3.3 — Add the `[Unreleased]` CHANGELOG entry
- [ ] T3.4 — Create ADR-0003 and validate touched Mermaid diagrams
- [ ] T3.5 — Set the spec status to `implemented`
- [ ] T3.6 — Commit closing documentation on `docs/documentation` using explicit paths
- [ ] T3.7 — Record residual limitations and any skipped live-provider verification in the handoff

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ⏳ | |
| AC-02 | ⏳ | |
| AC-03 | ⏳ | |
| AC-04 | ⏳ | |
| AC-05 | ⏳ | |
| AC-06 | ⏳ | |
| AC-07 | ⏳ | |
| AC-08 | ⏳ | |
| AC-09 | ⏳ | |
| AC-10 | ⏳ | |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
