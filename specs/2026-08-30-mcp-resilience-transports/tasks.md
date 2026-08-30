# Tasks: Resilient MCP connections and network transports

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-mcp-resilience-transports` |

## Phase 0 — Preparation

- [x] T0.1 — Read MCP, UI, security and architecture documentation.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify high risk and record negative scenarios.
- [x] T0.4 — Create feature branch `feat/mcp-resilience-transports`.

## Phase 1 — Implementation

- [x] T1.1 — Add validated STDIO/SSE/HTTP transport construction *(AC-04, AC-05)*.
- [x] T1.2 — Add first-connect consent and workspace tracking *(AC-03)*.
- [x] T1.3 — Add bounded reconnect lifecycle and shutdown guard *(AC-01, AC-02)*.
- [x] T1.4 — Add unit tests for security and lifecycle boundaries *(AC-04, AC-05)*.

## Phase 2 — Verification and documentation

- [x] T2.1 — Run syntax checks, MCP tests, full test suite, lint and diff checks.
- [x] T2.2 — Sync product, architecture, security, visual identity, glossary, feature registry, changelog and backlog.
- [x] T2.3 — Record acceptance evidence and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `MCP_RECONNECT_DELAYS` is `[500, 1000, 2000]`; close callbacks schedule at most three attempts and report terminal failure. |
| AC-02 | ✅ | `shutdownMcp()` sets the shutdown guard and clears pending retry timers before closing clients. |
| AC-03 | ✅ | Consent is requested before `client.connect`; rejected initialization exposes zero tools, covered by `test/mcp-resilience.test.js`. |
| AC-04 | ✅ | Transport tests cover STDIO, SSE, streamable HTTP, HTTP(S)-only URLs and missing environment interpolation. |
| AC-05 | ✅ | Existing MCP visibility tests and the new resilience boundary tests pass with the full suite; transport errors also redact authenticated URLs and bearer values. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `4670b3a` | `feat(mcp): add resilient remote transports` | `src/mcp.js`, tests, SDD |
| `c48bb8f` | `docs(mcp): document resilient transports` | Product, architecture, security, UI, glossary, feature registry and backlog |
| `c65233d` | `fix(mcp): redact secrets from transport errors` | Error sanitization and regression coverage, integrated into the final branch |
