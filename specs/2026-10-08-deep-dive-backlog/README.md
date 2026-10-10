# Deep-Dive Backlog Briefs — dispatch pack

> **Source of truth:** [docs/deep-dive.md](../../../docs/deep-dive.md) (sections referenced below).
> **Executor:** emile CLI running `glm-5.3-flash`. Each file in this folder is ONE self-contained prompt.
> **Language:** briefs are written in English on purpose — executor-model reliability and repo policy (ADR-0001 § Derived policies 4).

## How to dispatch

1. Work **one brief per session**, in the order below (P0 first). Do not batch two briefs in one run.
2. Paste the full brief content as the prompt. GLM 5.3 Flash must not need to re-derive the design — the brief carries it.
3. Each brief instructs the executor to follow SDD (`.clinerules` Rule 3): create `specs/YYYY-MM-DD-<slug>/` with spec/plan/tasks, implement, verify, sync docs. The brief supplies the design so the spec step is mostly transcription.
4. After each brief: run `npm run lint && npm test` locally before accepting the result.

## Dispatch order (dependency-aware)

| Order | Brief | Depends on |
|---|---|---|
| 1 | [P2-8 — resolve maxLoopIterations divergence](briefs/P2-8-maxloop-divergence.md) | none (trivial, warm-up) |
| 2 | [P2-11 architecture.md alignment](briefs/p2-11-doc-alignment.md) | none |
| 3 | [P2-10 README refresh](briefs/p2-10-readme-refresh.md) | none |
| 4 | [P0-2 skills path fix](briefs/p0-2-skills-path-and-origin.md) | none |
| 5 | [P1-5 skills multi-root](briefs/p1-5-skills-multi-root.md) | P0-2 |
| 6 | [P1-3 modelOverrides config](briefs/p1-3-model-overrides.md) | none |
| 7 | [P1-4 models.dev catalog](briefs/p1-4-models-dev-catalog.md) | none (pairs with P1-3) |
| 8 | [P2-7 honest context limit badge](briefs/p2-7-estimated-limit-badge.md) | P1-3 recommended |
| 9 | [P1-6 credentials multi-slot + /provider](briefs/p1-6-multi-slot-credentials.md) | none |
| 10 | [P0-1 thinking stream append-only](briefs/p0-1-thinking-append-only.md) | none |
| 11 | [P0-3 lifecycle recovery + stdin lease](briefs/p0-3-lifecycle-recovery-shutdown.md) | none |
| 12 | [P1-7 abort signals for tools](briefs/p1-7-tool-abort-signals.md) | none |
| 13 | [P2-9 render regression test](briefs/p2-9-render-regression-test.md) | after P0-1 |

## Dispatch order — wave 2 (grok-build analysis, 2026-10-09)

Items promoted from the comparison with xAI's production CLI ([deep-dive § 22](../../docs/deep-dive.md)). Same rules as above: one brief per session, SDD, `_shared-constraints.md` applies.

| Order | Brief | Depends on |
|---|---|---|
| 14 | [P0-4 paste-burst redraw clamp](briefs/p0-4-paste-burst-redraw.md) | none (active user-reported bug — first) |
| 15 | [P0-6 null-assistant session poison](briefs/p0-6-assistant-null-poison.md) | none (active user-reported bug — generation guard + load self-heal) |
| 16 | [P0-5 subprocess env scrub](briefs/p0-5-subprocess-env-scrub.md) | none (security, ~20 lines) |
| 17 | [P1-8 stationarity guard](briefs/p1-8-stationarity-guard.md) | none |
| 18 | [P1-9 output truncation + listDir cap](briefs/p1-9-output-truncation-caps.md) | none |
| 19 | [P1-10 tool-result secret redaction](briefs/p1-10-tool-result-redaction.md) | none (touches agent.js — sequence after P0-6/P1-8/P1-11 to minimize conflicts) |
| 20 | [P1-11 compression tool-pair repair](briefs/p1-11-compression-sanitize.md) | none (same invariants as P0-6 — dispatch after it) |
| 21 | [P1-12 retry hardening + stream idle watchdog](briefs/p1-12-retry-hardening.md) | none |

Un-briefed wave-2 backlog (generate a brief when scheduling): P2-12 (atomic saveSession — pair with P0-3), P2-13 (mid-turn steering), P2-14 (cache_control breakpoints), P2-15 (permission rules), P2-16 (lazy skill tool — pair with P1-5), P2-17 (lifecycle hooks).

## Status

| Brief | Status |
|---|---|
| P2-8 maxLoopIterations | ✅ done — `5ab35de` + `e8d12d1` |
| P2-10 README refresh | ✅ done — `7e8abc2` |
| P0-2 skills path | ✅ done — `7ccac7c` + `167c4a6` (spec: `specs/2026-10-08-skills-path-fix/`) |
| P2-11 doc alignment | ⚠ implemented in working tree, uncommitted (session 2026-10-08) |
| P0-4 paste-burst redraw | ✅ done — spec: `specs/2026-10-09-paste-burst-redraw/` |
| all others | ⏳ pending |
