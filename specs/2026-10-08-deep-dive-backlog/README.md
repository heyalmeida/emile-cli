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
| 22 | [P1-13 active-turn input cap (400 chars, silent)](briefs/p1-13-turn-input-cap.md) | none (found 2026-10-10 while dispatching P0-1) |
| 23 | [P2-18 viewport-budgeted prompt block](briefs/p2-18-prompt-viewport-layout.md) | none (closes the § 7.2 duplication family) |
| 24 | [P2-19 cursor-up clamp in the remaining renderers](briefs/p2-19-cursor-up-clamp-remaining.md) | none (found by the P0-1 executor: turn-keys, model-picker, prompt-input) |
| 25 | [P1-14 UI foundation from grok-build](briefs/p1-14-ui-foundation-from-grok-build.md) | none for stage A; stages B/C are independent. Subsumes P2-18 and P2-19 (both stay listed until stage A lands) |
| 26 | [P1-15 crash path through the coordinator](briefs/p1-15-crash-path-coordinator.md) | none (found by this session while verifying P0-3; complements it) |
| 27 | [P1-16 streaming flicker](briefs/p1-16-streaming-flicker.md) | none (daily-visible symptom fix; partly subsumed by P1-14 Stage A) |
| 28 | [P1-17 prompt policy: skills + MCP](briefs/p1-17-prompt-skills-mcp-policy.md) | none (needs ADR-0007 for the frozen-key extension) |
| 29 | [P1-18 design & UX pass (grok-build as the design base)](briefs/p1-18-design-ux-pass.md) | none; **Phase 1 stops for user approval** before any UI code |

Un-briefed wave-2 backlog (generate a brief when scheduling): P2-13 (mid-turn steering — brief exists as the un-briefed row in § 21.1 of the deep-dive), P2-14 (cache_control breakpoints), P2-15 (permission rules), P2-16 (lazy skill tool — pair with P1-5), P2-17 (lifecycle hooks). P2-12 (atomic saveSession) was **folded into the P0-3 brief** as item 8 — same durability surface, same files.

## Status

| Brief | Status |
|---|---|
| P2-8 maxLoopIterations | ✅ done — `5ab35de` + `e8d12d1` |
| P2-10 README refresh | ✅ done — `7e8abc2` |
| P2-11 doc alignment | ✅ done — `7fd4d67` + `64df2df` (spec: `specs/2026-10-08-doc-alignment/`) |
| P0-2 skills path | ✅ done — `7ccac7c` + `167c4a6` (spec: `specs/2026-10-08-skills-path-fix/`) |
| P0-4 paste-burst redraw | ✅ done — `c839957` (+ spec-hash `5d4623e`) (spec: `specs/2026-10-09-paste-burst-redraw/`) |
| P0-5 subprocess env scrub | ✅ done — `e360192` (+ spec-hash `a876a52`) (spec: `specs/2026-10-09-subprocess-env-scrub/`) |
| P0-6 assistant null poison | ✅ done — `2cce204` (+ spec-hash `05f6269`) (spec: `specs/2026-10-09-assistant-null-poison/`) |
| P1-15 crash path through the coordinator | ✅ done — `d0e55a5` + docs `7513b82` (spec: `specs/2026-10-10-crash-path-coordinator/`) |
| P0-3 recovery/shutdown integrity | ✅ done — `a95be54` + `e5b946b` + docs `ea30f96` (spec: `specs/2026-10-10-lifecycle-recovery-integrity/`; P2-12 folded in) |
| P1-13 turn-input cap | ✅ done — `3c68ca7` (spec: `specs/2026-10-10-turn-input-cap/`) |
| P0-1 thinking append-only | ✅ done — `57058b4` (spec: `specs/2026-10-10-thinking-append-only/`; shared clamp extracted to `src/ui/terminal-cursor.js`) |
| P1-6 provider system + custom endpoints | ✅ done — `7e7acd8` + `1632ddb` + `64df2df` (spec: `specs/2026-10-09-provider-system/`) |
| all others | ⏳ pending (P1-3, P1-4, P1-5, P1-7, P1-8…P1-12, P2-7, P2-9 (half-landed: the marker-count suites from P0-1/P0-4 cover the counting method; the shared emulator + screen-state assertions are still open), P2-12…P2-19, P1-14, P1-15, P1-16, P1-17, P1-18) |
