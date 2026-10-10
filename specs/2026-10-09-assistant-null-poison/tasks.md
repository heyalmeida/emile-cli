# Tasks: Never create, persist or resume an assistant message without content or tool_calls

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-assistant-null-poison` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation — *Rule 1* — `.clinerules`, brief P0-6 + `_shared-constraints.md`, `docs/deep-dive.md` § 3/§ 4/§ 10/§ 20/§ 21.1/§ 22.3/§ 22.6, `docs/code-quality-and-security.md` § 1–6, `docs/architecture.md`, ADR-0001/0002/0003, `features/session-lifecycle.md`, `features/agent-loop.md`, `specs/README.md`, `specs/_templates/*`; full reads of `src/history.js`, `src/agent/agent.js:280-757`, `src/cli.js:225-290`, `test/empty-stream-line.test.js`, `test/agent-reasoning-stream.test.js`, `test/session-reasoning.test.js`, `test/session-resilience.test.js`, `test/plans-compression.test.js`, `test/turn-interrupt.test.js`
- [x] T0.2 — Spec + plan `approved` before any code (Rule 3 order spec → plan → tasks → code); flipped to `implemented` at close
- [x] T0.3 — Risk **Medium** (conversation-history integrity across `agent.js` + `history.js` + the persisted-session contract); threat surfaces and negative criteria fixed in spec § 4 and plan § 3; gates in plan § 8
- [x] T0.4 — Branch `development`; `git status` inspected. The brief warned about another session's in-flight changes to `src/ui/prompt-input-persistent.js`, `test/prompt-input-render.test.js` and `specs/2026-10-09-paste-burst-redraw/` plus junk untracked files: the tree was **clean** at start (those files were committed as `c839957` in the P0-4 brief) and the junk files (`'linha`, `(ch`, `setImmediate(r))`, `{`) do not exist. Nothing foreign was staged, edited or deleted
- [x] T0.5 — Verified the new import edge is acyclic: a dependency-graph walk shows `history.js`'s closure is `config.js`, `ui/log.js`, `tools/security.js`, `memory/constants.js` (+ their deps) and never reaches `agent/`; `history.js` was already loaded by `agent.js` transitively via `lifecycle/index.js`. `config.js` does not import `history.js`, which is why the tests can rely on the module-level `historyDir`
- [x] T0.6 — Baseline recorded on the exact start commit: `npm test` → **370 tests / 360 pass / 0 fail / 10 skipped / exit 0**; lint → 0 errors / 144 warnings (the brief's "324" is stale, as in P0-4/P0-5)
- [x] T0.7 — Verified the reported facts in code before changing anything: `agent.js:598-601` builds `{content: textContent || null}`, `:610-613` attaches `tool_calls` only when present, `:664` pushed unconditionally on the error path (the stream `catch` at `:536-545` falls through; only the cancel path breaks first), `streamErrored` (`:445`) is read at `:551` and **never assigned**, and `getSessionRecord` returned `data.messages` unvalidated

## Phase 1 — Implementation

- [x] T1.1 — `src/history.js:17-48`: exported pure `isValidAssistantMessage(message)` — `true` for non-assistant roles, non-object entries, any non-null/undefined/non-empty content (string **or** structured), and any non-empty `tool_calls`; `false` only for assistant + empty/absent content + missing/empty `tool_calls` *(verifies RF-S01, RF-S07, AC-06)*
- [x] T1.2 — `src/history.js:81`: `preparePersistedMessages` now ends `.filter(isValidAssistantMessage)`, so `saveSession` → `trimPersistedMessages` → `finalizeSessionTurn` and every `tool_pending` checkpoint are covered by one site *(verifies RF-S04, AC-02)*
- [x] T1.3 — `src/history.js:183-191`: `getSessionRecord` filters `data.messages` through the same predicate **on read only** and warns with the dropped count; a non-array `messages` field keeps its previous falsy shape so `cli.js`'s `if (loaded)` "failed to load → start new" behaviour is not changed into a silently empty resume *(verifies RF-S05, RF-S06, AC-03)*
- [x] T1.4 — `src/agent/agent.js`: imports the predicate (`:27`) and guards both push sites — the cancel path (`:662`) and the normal path (`:672`). Both cancel notices, the tool-batch branch and the `executableToolCalls` flow are untouched *(verifies RF-S02, RF-S03, AC-01, AC-04, AC-08)*
- [x] T1.5 — `src/agent/agent.js:541`: `streamErrored = true` in the stream `catch`, so the "· (empty response)" notice no longer double-prints after a real error while a genuinely empty (non-erroring) stream still reports it *(verifies RF-S09, AC-05)*
- [x] T1.6 — Nothing else moved: retry/fallback/forced-compression, checkpoint shape, tool placeholders, `client.js` statuses, the compression split logic (P1-11) and `saveSession`'s write path are unchanged; the diff is 4 hunks in `agent.js` and 6 in `history.js` *(verifies RF-S11, AC-08)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Predicate matrix in `test/history-sanitize.test.js`: null/absent/`''` content without `tool_calls` invalid; `tool_calls: []` treated as absent; reasoning-only invalid; `content:null` **with** `tool_calls` valid (F7); array/multimodal content valid; `user`/`system`/`tool`, `null`, `undefined` and a non-object entry all pass *(verifies AC-06)*
- [x] T2.2 — `preparePersistedMessages`: drops the invalid assistant, keeps the `tool_calls`-shaped one with its `tool_call_id` pairing intact, and does not mutate the input array *(verifies AC-02, AC-04)*
- [x] T2.3 — `saveSession` round-trip: the file written to disk from a hand-built poisoned array contains no invalid assistant, while the `tool_pending` checkpoint record survives *(verifies AC-04)*
- [x] T2.4 — `getSessionRecord` on the user's exact fixture (`assistant null` → `user "Prossiga"` ×3): 3 empty assistants removed, nothing else; order preserved; consecutive `user` messages **not merged**; and the file bytes are **identical before and after** the read *(verifies AC-03, RF-S06, RF-S08)*
- [x] T2.5 — Boundary guard: a record with no `messages` array and one with `messages: null` keep their falsy shape (no coercion to `[]`) *(protects the `cli.js` load branch)*
- [x] T2.6 — Integration: `runAgent` with a completion that throws after zero chunks → zero assistant messages in live history and "Stream error" printed; the reasoning-only-then-throw variant → no record in live history **and** none in `preparePersistedMessages(history)` *(verifies AC-01, AC-02)*
- [x] T2.7 — 400-emulation: a fake `createCompletion` that rejects any assistant lacking content or `tool_calls` (`assertWireValid`) runs turn 1 (stream dies), turn 2 ("Prossiga") and turn 3 over the same accumulated history — all three complete, the errored turn contributed no assistant, and every user turn is still present *(verifies AC-07)*
- [x] T2.8 — Resumed poisoned session: `getSessionRecord` → clean array → `runAgent` over it with the same strict provider completes and answers; the rejection path never fires *(verifies AC-03)*
- [x] T2.9 — Cancel path: a cancel after reasoning-only deltas adds **no** assistant, and a cancel after real text still keeps the partial text (documented semantics) *(verifies AC-08, RF-S03)*
- [x] T2.10 — Tool-only turns: `content:null` + `tool_calls` is kept, its `tool` result still follows and the pairing (`tool_call_id`) is intact *(verifies AC-04)*
- [x] T2.11 — The empty-response notice still prints for a genuinely empty, non-erroring stream *(verifies AC-05's boundary)*
- [x] T2.12 — **Mutation verification (the honest gate)** — each guard reverted on its own, new suite re-run, sources restored in a `finally`:
  - generation guard off → fails: `zero-chunk stream error leaves no assistant message`, `reasoning-only turn`, `no 400 poison loop`
  - cancel-path guard off → fails: `a cancel that arrived before any text adds no assistant message`
  - persist guard off → fails: `preparePersistedMessages drops the invalid assistant`, `saveSession writes no invalid assistant`
  - load guard off → fails: `getSessionRecord self-heals the reported poison pattern`, `a poisoned session resumes clean`
  - `streamErrored` never set → fails: `zero-chunk stream error` (the AC-05 assertion)
  - baseline and restored runs both exit 0 → every guard is load-bearing and no test passes vacuously
- [x] T2.13 — `node --check src/agent/agent.js`, `node --check src/history.js`, `node --check test/history-sanitize.test.js` → all clean
- [x] T2.14 — `node --test test/history-sanitize.test.js` → **17 tests / 17 pass / 0 fail / 0 skipped**
- [x] T2.15 — Regression subset `node --test test/empty-stream-line.test.js test/session-reasoning.test.js test/session-resilience.test.js test/turn-interrupt.test.js test/plans-compression.test.js test/agent-reasoning-stream.test.js` → exit 0 with all files green
- [x] T2.16 — `npm run lint` → **144 problems (0 errors, 144 warnings)** — identical to baseline; `npm test` → **387 tests / 377 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** (= baseline 370 + the 17 new)
- [x] T2.17 — `npm audit` → not applicable: no dependency added; `package.json`/lockfile untouched
- [x] T2.18 — Test hygiene: unique session ids, `deleteSession` in `finally`, verified afterwards that `.emile/history/` holds **no** `test_*` leftovers and `git status` shows no stray files (the tool-only turn calls the real `readFile` handler with `{}`, which returns an error string without touching the workspace)
- [x] T2.19 — Every acceptance criterion verified; log below

## Phase 3 — Documentation and Closing

- [x] T3.1 — `CHANGELOG.md` `[Unreleased] → Fixed`: the dead-stream poison, the three boundaries, self-heal on resume, the preserved `content:null`+`tool_calls` shape, the cancel-path semantics and the double-notice fix
- [x] T3.2 — `docs/deep-dive.md`: § 21.1 **P0-6** row marked ✅ applied (date + spec); § 10 gains the **history-shape invariant** bullet (generation/persist/load, read-time only, self-heal, `content:null`+`tool_calls` still valid, consecutive `user` not merged, orphan repair stays P1-11); § 20 gains the pattern row "História validada nas três fronteiras"; § 22.3's compaction row notes that the validation-on-every-rewrite invariant now covers the empty-assistant class while P1-11 remains open for orphan `tool`/`tool_calls` pairing
- [x] T3.3 — Rule 7.4: Change History row in `features/session-lifecycle.md` and `features/agent-loop.md`; `docs/architecture.md` `history.js` row records the shape validation
- [x] T3.4 — **Citation repair (Rule 0)**: my insertions shifted every `agent.js`/`history.js` line reference in the canonical docs. All **46** current-behaviour citations in `deep-dive.md` § 3–§ 20 were recomputed from the diff hunk offsets and re-verified to land on the construct they name (script `cites` → `now found at` sweep before, content check after: 0 out-of-range). § 21.x backlog rows and § 22 (the dated grok-build analysis) deliberately keep the numbers from the day of diagnosis. Rule 5 revalidation: 6 touched table rows keep their column counts, no Mermaid block was created or edited
- [x] T3.5 — Spec and plan status → `implemented`
- [x] T3.6 — Commit on `development` with only explicit paths staged (Rule 8); hash recorded below
- [x] T3.7 — Limitations and residual risk recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `a zero-chunk stream error leaves no assistant message in live history` — 0 assistant messages in the returned array; mutation-verified (guard off ⇒ fail) |
| AC-02 | ✅ | `a reasoning-only turn that errors leaves no record in live history or its projection` — live array and `preparePersistedMessages(history)` both clean |
| AC-03 | ✅ | `getSessionRecord self-heals the reported poison pattern on read` (3 empty assistants dropped, order preserved, file bytes unchanged) + `a poisoned session resumes clean and completes its next turn` (strict provider accepts, turn answers) |
| AC-04 | ✅ | Predicate tests (`content:null` + `tool_calls` valid), `preparePersistedMessages` keeps it, `saveSession` round-trip keeps it with `tool_call_id` pairing, `tool_calls-only turns still reach history with their results paired` |
| AC-05 | ✅ | `a zero-chunk stream error…` asserts stdout matches `/Stream error/` and does **not** match `/empty response/`; `a genuinely empty stream still prints the empty-response notice` pins the other side; mutation-verified on the flag |
| AC-06 | ✅ | Four predicate tests covering the full matrix incl. multimodal array content, `tool_calls: []`, non-assistant roles and junk entries |
| AC-07 | ✅ | `the same session survives consecutive turns: no 400 poison loop` — `assertWireValid` (the provider's rule) runs on every request of three consecutive turns |
| AC-08 | ✅ | `a cancel that arrived before any text adds no assistant message` + `a cancel that arrived with real text keeps that partial response`; `test/turn-interrupt.test.js`, `test/plans-compression.test.js`, `test/agent-reasoning-stream.test.js`, `test/session-reasoning.test.js`, `test/session-resilience.test.js` all green unchanged |
| AC-09 | ✅ | `node --check` clean ×2 files (+ the test); new suite 17/17 on Windows; `npm test` 387/377 pass/0 fail/exit 0; `npm run lint` 0 errors / 144 warnings (baseline) |
| AC-10 | ✅ | CHANGELOG + deep-dive § 21.1/§ 10/§ 20/§ 22.3 + `features/session-lifecycle.md` + `features/agent-loop.md` + `docs/architecture.md` + briefs pack status; 46 shifted citations repaired and content-verified |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `git status --porcelain` (start) | clean — no in-flight or junk files to avoid |
| `npm test` (pre-change baseline) | 370 / 360 pass / 0 fail / 10 skipped / exit 0 |
| `node --check src/agent/agent.js src/history.js` | exit 0 |
| `node --test test/history-sanitize.test.js` | **17 / 17 pass / 0 fail** |
| mutation matrix (5 guards) | every guard reverted ⇒ exit 1 with the expected failing test; baseline and restored ⇒ exit 0 |
| regression subset (6 pre-existing suites) | exit 0 |
| `npm run lint` (post-change) | **144 problems (0 errors, 144 warnings)** — unchanged from baseline |
| `npm test` (post-change) | **387 / 377 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** |
| citation repair check | 46 current-behaviour citations recomputed; 0 out-of-range; spot-checked against the named construct |
| leftover artefacts | no `test_*` files in `.emile/history/`; `git status` shows only intended paths |

## Limitations / Residual Risk

- **Interactive smoke not executed**: reproducing the original failure end-to-end needs a live provider that returns an empty/erroring stream (`node bin/emile.js`), which this environment cannot drive. The 400-emulating integration test reproduces the provider rule and the reported transcript verbatim instead.
- **A `tool_pending` checkpoint written before this fix** whose assistant was empty-but-checkpointed is not repaired by the load filter (only `messages` are filtered; `pendingToolCalls` already fails closed through `isValidPendingToolCall`). Recording, not fixing: the new generation guard makes it unreachable going forward.
- **Resumed poisoned sessions keep consecutive `user` messages** (`Prossiga` ×3). Accepted per the brief: valid on the chat-completions wire, and the 400 only ever names the assistant record.
- **Orphan `tool`/`tool_calls` repair after compression stays open** — brief P1-11; deliberately not duplicated here (the predicate never removes a message carrying `tool_calls`, so it cannot orphan a tool result).
- **Numeric citations in `deep-dive.md` are fragile**: any edit to `agent.js`/`history.js` shifts them (this change moved 61, of which 46 described current behaviour and were repaired). Anchoring references to exported symbol names instead of line numbers would remove the whole class — reported as a follow-up, not done here (out of scope).
- **`saveSession` atomicity** (tmp+rename) is still P2-12; this change does not touch the write mechanism.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ⏳ (recorded after commit) | `fix(agent): never persist or resume assistant messages without content or tool_calls` | `src/agent/agent.js`, `src/history.js`, `test/history-sanitize.test.js`, `specs/2026-10-09-assistant-null-poison/*`, `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/agent-loop.md`, `features/session-lifecycle.md`, `specs/2026-10-08-deep-dive-backlog/README.md` |