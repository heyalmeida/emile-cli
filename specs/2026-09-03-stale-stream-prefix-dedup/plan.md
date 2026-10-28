# Plan — Deduplicate stale stream snapshots

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-stale-stream-prefix-dedup` |
| **Status** | `implemented` |

## 1. Technical Approach

Extend the pure `getIncrementalText()` normalizer with one conservative rule: if the incoming value is strictly shorter than the accumulated value and the accumulated value starts with it, treat the incoming value as a stale snapshot and return no new text. The rule is applied before the existing suffix/overlap heuristics and automatically covers legacy reasoning, response content and structured reasoning fields that use the same helper.

Add focused unit tests for stale prefixes and a runAgent regression where both reasoning and content repeat stale prefixes. Preserve the existing cumulative, equal, suffix and overlap behavior.

## 2. Architectural Compliance

- **ADR-0001:** no new dependency or build step.
- **Architecture:** stream normalization remains in `src/agent/reasoning.js`; agent loop and UI contracts remain unchanged.
- **Security:** no new input execution, persistence or secret surface.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Untrusted provider text | Still treated as data; no prompt or command semantics are added. |
| Secret/output | No new output; no raw text is logged. |
| File/tool boundaries | Unchanged. |
| Failure behavior | Unknown or new suffixes continue through existing normalization; no content is fabricated. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Reasoning normalization | `src/agent/reasoning.js` | Detect stale shorter prefix snapshots. |
| Unit tests | `test/reasoning.test.js` | Add stale-prefix and structured-block regressions. |
| Agent integration test | `test/stream-dedup.test.js` | Verify final history does not duplicate repeated prefixes. |

## 5. Impacted Flags / Slash Commands / Tools

None.

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `src/agent/reasoning.js` | Add one strict stale-prefix condition. |
| Modify | `test/reasoning.test.js` | Unit coverage. |
| Create | `test/stream-dedup.test.js` | Agent-level regression. |
| Create | `specs/2026-09-03-stale-stream-prefix-dedup/{spec,plan,tasks}.md` | SDD record. |
| Modify | `CHANGELOG.md` | Unreleased fix entry. |
| Modify | `docs/architecture.md` | Document stale snapshot normalization. |
| Modify | `features/agent-loop.md` | Registry traceability. |

## 7. Technical Decisions

- The rule is intentionally narrow: `next.length < prior.length && prior.startsWith(next)`.
- Do not alter UI redraws or provider requests until the history-level duplication is fixed and re-captured.
- Keep `output-logs.txt` as reproduction evidence and do not edit it.

## 8. Verification Strategy and Gates

- `node --check src/agent/reasoning.js test/reasoning.test.js test/stream-dedup.test.js`.
- `node --test test/reasoning.test.js test/stream-dedup.test.js test/agent-reasoning-stream.test.js test/live-response-stream.test.js`.
- `npm test` and `npm run lint`; record the existing Windows symlink/cwd limitations separately.
- Compare a captured history/export after the fix against the duplicated `output-logs.txt` pattern.

## 9. Git Workflow

Keep the current branch and stage only explicit files. No branch operations.

## 10. Failures, Partial State and Rollback

The change is a pure normalization rule. If it causes an unexpected valid-prefix loss, revert the single condition and retain the reproduction/test for follow-up analysis. No session migration is required.

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legitimate repeated prefix is suppressed | Low | Restrict to strictly shorter incoming values and test normal deltas/suffixes. |
| Visual duplication remains after history fix | Medium | Re-capture the log and inspect renderer only if exported history is clean. |
