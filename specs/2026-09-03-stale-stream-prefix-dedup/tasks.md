# Tasks — Deduplicate stale stream snapshots

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-stale-stream-prefix-dedup` |

## Phase 0 — Preparation

- [x] T0.1 — Read the streaming/reasoning specs, architecture, visual identity, security guidance and related tests.
- [x] T0.2 — Inspect `output-logs.txt` and identify repeated reasoning/final paragraphs.
- [x] T0.3 — Classify the change as medium risk and map provider stream/history boundaries.
- [x] T0.4 — Create the approved spec and plan.

## Phase 1 — Implementation

- [x] T1.1 — Add strict stale-prefix detection to `getIncrementalText`.
- [x] T1.2 — Add unit coverage for legacy and structured reasoning.
- [x] T1.3 — Add an agent-level regression for repeated content/reasoning prefixes.

## Phase 2 — Testing and Verification

- [x] T2.1 — Focused reasoning, agent stream and live-response tests passed: 16/16. — Run focused reasoning, stream and live-response tests.
- [x] T2.2 — Syntax checks passed; `npm run lint` completed with 0 errors (existing warnings only); full suite is 246 passed, 6 unrelated Windows failures and 2 skipped POSIX mode checks. — Run syntax, lint and full suite; record unrelated Windows failures.
- [x] T2.3 — The reproduced `output-logs.txt` pattern is explained by stale shorter-prefix snapshots: the old normalizer appended the repeated prefix; the new unit/agent regressions prove the final history is deduplicated. — Compare the normalized history behavior with the duplicated `output-logs.txt` reproduction.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced architecture, agent-loop feature registry, changelog and this SDD record. — Sync architecture, agent-loop feature registry and changelog.
- [x] T3.2 — Marked spec/plan implemented after focused verification. — Mark the spec and plan implemented after verification.
- [x] T3.3 — Recorded residual risk: a provider that sends out-of-order or semantically new text which is a strict prefix can be conservatively suppressed; visual-only duplication still requires a fresh terminal capture. — Record any remaining visual-only duplication risk.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `reasoning.test.js` stale-prefix cases pass. |
| AC-02 | ✅ | Structured reasoning stale-prefix regression passes. |
| AC-03 | ✅ | Existing cumulative/delta tests remain green. |
| AC-04 | ✅ | `stream-dedup.test.js` proves final reasoning/content contain no repeated prefixes. |
| AC-05 | ✅* | Syntax, lint and full suite completed; 246 passed, 6 unrelated Windows failures and 2 skipped POSIX mode checks. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| — | Not created automatically | — |
