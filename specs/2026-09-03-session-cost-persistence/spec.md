# Spec: Persist per-session cost and token history

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-session-cost-persistence` |
| **Status** | `implemented` |
| **Phase/Context** | Session lifecycle / cost telemetry |
| **Related documents** | [PRD](../../docs/product.md), [architecture](../../docs/architecture.md), [session lifecycle](../2026-08-30-session-resilience/spec.md), [model system](../2026-08-25-model-system/spec.md) |

## 1. Problem / Motivation

`/cost` currently reads a process-local `sessionStats` object. It accumulates usage only while the current CLI process is running. When the CLI is closed and a saved session is resumed, the old usage totals are not restored; the display contains only usage from the resumed process, excluding the session's earlier turns.

The stats must be scoped to the active saved session, not accidentally shared across unrelated sessions. Every session record should carry its cumulative usage snapshot, and switching/starting sessions should load or reset that snapshot explicitly.

## 2. Goal

Persist cumulative token/cost counters with each session, restore them when a session is resumed or selected, reset them for a new session, and keep existing context-window estimates independent from cumulative usage.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | Session records MUST persist bounded numeric usage counters: prompt, completion, cached, total cost and last response usage. | Must |
| RF-S02 | Resuming or selecting a session MUST restore that session's persisted counters before the next turn. | Must |
| RF-S03 | Starting a new session MUST reset usage counters to zero while preserving the configured context limit. | Must |
| RF-S04 | Switching sessions MUST replace, not add to, the previous session's counters. | Must |
| RF-S05 | Existing session records without stats MUST remain loadable; unknown historical usage must not be fabricated. | Must |
| RF-S06 | Checkpoint and final saves MUST include the same cumulative stats snapshot. | Must |
| RF-S07 | `/cost` and the status footer MUST continue to consume the same `sessionStats` object and show the active session's totals. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes persisted session metadata and session-switch state. |
| **Assets/secrets** | Usage metadata only; no message content, credentials or reasoning is added. |
| **Command execution / file writes** | Adds bounded numeric metadata to existing `.emile/history/*.json` writes; no tool execution changes. |
| **Untrusted inputs** | Existing session metadata is parsed defensively; invalid counters are ignored and fall back to zero. |
| **Negative criteria** | Never mutate message history, never merge counters from different sessions, never persist unbounded/untrusted stats, never expose credentials. |

## 5. Out of Scope

- Cross-session/global lifetime cost aggregation.
- Reconstructing exact historical API usage for old records that never stored usage metadata.
- Changing provider pricing or token estimation.
- Changing `/cost` output formatting beyond clarifying active-session scope if needed.

## 6. Acceptance Criteria

- **AC-01:** A completed session saves cumulative prompt/completion/cached/cost counters in its history record.
- **AC-02:** Closing and resuming that session restores the counters and `/cost` displays them before a new API call.
- **AC-03:** Switching from session A to session B shows B's counters, not A plus B.
- **AC-04:** `/new` resets counters to zero and the next turn starts from zero.
- **AC-05:** A legacy record without stats loads safely with zero known usage and does not crash or fabricate exact historical cost.
- **AC-06:** Checkpoint/final saves retain cumulative stats, and existing session message persistence/recovery tests remain green.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-----------------|
| Existing sessions have no usage metadata. | Medium | Load safely with zero known usage and document that exact old usage cannot be recovered. |
| Crash between a usage response and session save. | Low | Final and checkpoint saves use the current snapshot; a lost last response remains a bounded limitation. |
| Session A counters leak into B. | High | Explicit restore/reset on every switch/new path and tests for both directions. |
| Stats metadata grows or becomes malicious. | Low | Persist only finite non-negative numbers in a fixed schema. |

## 8. References

- `src/agent/session-stats.js` — mutable process stats and context math.
- `src/history.js` — session record schema and persistence.
- `src/cli.js` — startup, session save and command context.
- `src/commands/handlers.js` — session switch/new/rewind handlers.
- `test/session-resilience.test.js` and `test/commands.test.js` — existing lifecycle coverage.
