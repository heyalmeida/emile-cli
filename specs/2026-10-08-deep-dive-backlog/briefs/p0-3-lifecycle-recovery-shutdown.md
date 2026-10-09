# BRIEF P0-3 — Lifecycle: repair recovery vocabulary and devolve the stdin lease on idle shutdown

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 10 and § 18 (the full findings).

## Goal

Three shutdown/recovery defects, all verified in code:

1. **Boot scanner never fires.** `runStartupRecovery()` filters `record.status !== 'pending'` (`src/recovery.js:95`) and `listPending()` filters `'pending'` (`src/history.js:259-261`) — but `saveSession()` only ever persists `tool_pending` or `complete` (`history.js:82`). Result: the boot scan always reports 0/0 and `moveToCorrupt` is never exercised.
2. **`markAborted` is orphaned.** It is wired into the shutdown coordinator (`src/cli.js:169`) and typed in `drain-tools.js` PhaseContext, but NO phase ever calls it. If later "fixed" naively it would overwrite `tool_pending` checkpoints with `aborted` and kill resumability.
3. **Stdin lease not restored on idle SIGINT.** Phase 1 injects a no-op `setPromptShutdown` (`src/lifecycle/index.js:55-58`); nothing returns the terminal from raw mode when SIGINT arrives while the REPL is idle. `process.on('exit')` restores paste/cursor/SGR only (`index.js:108-111`), not raw mode.

## Required design

1. **Recovery scanner**: filter on `tool_pending` in `recovery.js:95` (and `listPending` → rename to match reality, `history.js:259-261`). Classification stays `recoverable | corrupt` — add the `abandoned` class ONLY if you keep it real (see 2), otherwise remove `cli.js:154`'s read of `recoveryReport.abandoned`.
2. **Mark aborted correctly**: the coordinator must call `markAborted(currentSessionId)` from the `flush-session` phase ONLY for sessions whose last checkpoint was mid-turn, and must preserve `pendingToolCalls` so load-time `resumePendingTools` still works. Concretely: change `markAborted` to NOT destroy `status: 'tool_pending'` — either keep tool_pending and add a separate `aborted: true` boolean, or skip overwriting when status is `tool_pending`. Choose one, document the choice in the spec, and make `resumeLoadedSession` (`src/cli.js:252-287`) treat that state explicitly.
3. **Idle SIGINT cleanup**: in phase 1 (`stop-input.js`), actually stop the persistent prompt: the injected `shutdownPrompt` must perform real cleanup (remove keypress listeners, restore `wasRaw`, disable bracketed paste) — reuse/extend whatever the prompt module already exposes for its own detach (see `prompt-input-persistent.js` teardown path). The `process.on('exit')` hook stays as last-resort fallback.

## Tests to add

- `test/lifecycle-recovery.test.js`: temp `.emile/history/` with (a) a `tool_pending` record → scanner classifies recoverable; (b) malformed JSON → corrupt; (c) `complete` record → ignored. Assert the `RecoveryReport` shape.
- `test/lifecycle-stdin.test.js`: SIGINT simulation (call the coordinator directly with injected `flushSync`/`markAborted` no-ops); assert the prompt shutdown hook is invoked (spy) and raw-mode restore attempted (you may need a seam: the phase must invoke an injected prompt-shutdown function — make `stop-input.js` call the injected `shutdownPrompt` instead of the current no-op contract).

## Constraints

- Tool results of pending sessions must still be replayed only via `resumePendingTools` (`agent.js:152-192`) — do not execute tools at boot (recovery stays read-only).
- Never throw from lifecycle phases (existing pattern: catch + verbose log).

## Verification

`node --check src/recovery.js src/history.js src/lifecycle/index.js && node --test test/lifecycle-*.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: boot recovery scan never matched any session; stdin lease restored on idle SIGINT.
- `docs/architecture.md` § 2 recovery.js row: correct path (`.emile/history/corrupt/<id>/`) and the real classification.
- `docs/deep-dive.md` § 18: mark fixes applied.
